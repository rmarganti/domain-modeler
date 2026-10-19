import { Array, Option, Schema } from "effect";

import { CheckFileOnDisk, ReloadFileFromDisk } from "../command";
import * as Doc from "../domain/document";
import { merge, type Conflict } from "../domain/merge";
import { DomainModelDocument } from "../domain/schema";
import { shortcutFor } from "../keymap";
import type { DiskReadIssue } from "../message";
import {
  EditorState,
  fileNameOf,
  hasSameContent,
  type DiskIssue,
  type Model,
  type Notice,
} from "../model";
import { commitDocument, present, type UpdateReturn } from "./shared";

// External edits to the open file (see ARCHITECTURE.md). A change on disk is
// read, synced, and held as pending until the editor is idle, then merged
// into the present document against the saved one: ours wins every conflict,
// and the merge is one undo entry.

const isSameDocument = Schema.toEquivalence(DomainModelDocument);

/** Results for a file that is no longer open are stale. */
const isOpen = (model: Model, path: string): boolean => Option.contains(model.maybeFilePath, path);

/** Reports `issue` once, not again while it lasts. */
const reportOnce = (model: Model, issue: DiskIssue, notice: Notice): Model =>
  Option.contains(model.maybeDiskIssue, issue)
    ? model
    : { ...model, maybeDiskIssue: Option.some(issue), maybeNotice: Option.some(notice) };

/** Takes a version from disk without its viewport, which is never shared. */
const withOurViewport = (model: Model, theirs: DomainModelDocument): DomainModelDocument => ({
  ...theirs,
  layout: { ...theirs.layout, viewport: present(model).layout.viewport },
});

// CHECKING

/** The file may have changed: read it back. */
export const check = (model: Model): UpdateReturn =>
  Option.match(model.maybeFilePath, {
    onNone: () => ({ model }),
    onSome: (path) => ({ model, commands: [CheckFileOnDisk({ path })] }),
  });

export const read = (model: Model, path: string, document: DomainModelDocument): Model => {
  if (!isOpen(model, path)) return model;
  const theirs = Doc.syncLayout(document);
  return Option.match(model.maybeSavedDocument, {
    // Nothing to merge from. Matching content becomes the saved document;
    // anything else waits for Reload from disk.
    onNone: () =>
      hasSameContent(theirs, present(model))
        ? { ...model, maybeSavedDocument: Option.some(theirs), maybeDiskIssue: Option.none() }
        : reportOnce(model, "Diverged", {
            tone: "Info",
            text: `${fileNameOf(path)} changed on disk. Reload from disk (${shortcutFor("reloadFromDisk")}) to use that version.`,
          }),
    // Our own saves read back as the saved document.
    onSome: (saved) => ({
      ...model,
      maybePendingDiskDocument: isSameDocument(theirs, saved) ? Option.none() : Option.some(theirs),
      maybeDiskIssue: Option.none(),
    }),
  });
};

export const failedRead = (model: Model, path: string, issue: DiskReadIssue): Model => {
  if (!isOpen(model, path)) return model;
  const name = fileNameOf(path);
  return issue === "Invalid"
    ? reportOnce(model, "Invalid", {
        tone: "Error",
        text: `${name} on disk isn't a valid model right now. Keeping your version.`,
      })
    : // Without a saved document the model reads as unsaved, so Save writes it back.
      reportOnce(
        { ...model, maybeSavedDocument: Option.none(), maybePendingDiskDocument: Option.none() },
        "Missing",
        { tone: "Error", text: `${name} is missing on disk. Save to write it back.` },
      );
};

// MERGING

/** Merges only once nothing is mid-edit, mid-drag, or mid-pick. */
const canMerge = (editor: EditorState): boolean =>
  editor._tag === "Idle" || editor._tag === "ViewingShortcuts";

const MAX_LISTED_CONFLICTS = 3;

const describeConflicts = (conflicts: ReadonlyArray<Conflict>): string => {
  const labels = Array.dedupe(conflicts.map((conflict) => conflict.label));
  const listed = labels.slice(0, MAX_LISTED_CONFLICTS).join(", ");
  const rest = labels.length - MAX_LISTED_CONFLICTS;
  return rest > 0 ? `${listed} and ${rest} more` : listed;
};

const mergeIn = (
  model: Model,
  path: string,
  base: DomainModelDocument,
  theirs: DomainModelDocument,
): Model => {
  const { document, conflicts } = merge(base, present(model), theirs);
  const merged = commitDocument(model, () => Doc.syncLayout(document));
  const name = fileNameOf(path);
  const maybeNotice: Option.Option<Notice> = Array.isReadonlyArrayNonEmpty(conflicts)
    ? Option.some({
        tone: "Info",
        text: `Merged changes from ${name}. Kept your version of ${describeConflicts(conflicts)}.`,
      })
    : merged.history !== model.history
      ? Option.some({ tone: "Info", text: `Updated from ${name}` })
      : model.maybeNotice;
  return { ...merged, maybeSavedDocument: Option.some(theirs), maybeNotice };
};

/** Merges a pending change from disk if the editor is free. Runs after every message. */
export const applyPending = (model: Model): Model => {
  if (!canMerge(model.editor)) return model;
  return Option.match(
    Option.all([
      model.maybePendingDiskDocument,
      model.maybeSavedDocument,
      model.maybeFilePath,
    ] as const),
    {
      onNone: () => model,
      onSome: ([theirs, base, path]) =>
        mergeIn({ ...model, maybePendingDiskDocument: Option.none() }, path, base, theirs),
    },
  );
};

// RELOADING

export const reload = (model: Model): UpdateReturn =>
  Option.match(model.maybeFilePath, {
    onNone: () => ({
      model: { ...model, maybeNotice: Option.some({ tone: "Info", text: "No file to reload." }) },
    }),
    onSome: (path) => ({ model, commands: [ReloadFileFromDisk({ path })] }),
  });

/** Discards unsaved changes for the file's version, as one undoable entry. */
export const reloaded = (model: Model, path: string, document: DomainModelDocument): Model => {
  if (!isOpen(model, path)) return model;
  const theirs = Doc.syncLayout(document);
  return {
    ...commitDocument(model, () => withOurViewport(model, theirs)),
    maybeSavedDocument: Option.some(theirs),
    maybePendingDiskDocument: Option.none(),
    maybeDiskIssue: Option.none(),
    maybeNotice: Option.some({ tone: "Info", text: `Reloaded ${fileNameOf(path)}` }),
  };
};

export const failedReload = (model: Model, path: string, issue: DiskReadIssue): Model =>
  isOpen(model, path)
    ? {
        ...model,
        maybeNotice: Option.some({
          tone: "Error",
          text: `Couldn't reload ${fileNameOf(path)}: ${issue === "Invalid" ? "it isn't a valid model" : "it's missing on disk"}.`,
        }),
      }
    : model;
