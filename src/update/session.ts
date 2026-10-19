import { Option } from "effect";

import { ConfirmCloseWindow, OpenFile, SaveFile, SaveFileAs } from "../command";
import * as Doc from "../domain/document";
import * as History from "../domain/history";
import type { DomainModelDocument } from "../domain/schema";
import { EditorState, Selection, fileNameOf, type Model, type Notice } from "../model";
import { applyPending } from "./disk";
import { finishEditing } from "./editing";
import * as Rows from "./rows";
import { commitDocument, deselect, present, reconcile, toIdle, type UpdateReturn } from "./shared";

// History, selection-wide actions, files, and the window.

// HISTORY

const restore = (model: Model, maybeHistory: Option.Option<History.History>): Model =>
  Option.match(maybeHistory, {
    onNone: () => model,
    onSome: (history) => reconcile({ ...toIdle(model), history }),
  });

export const undo = (model: Model): Model => restore(model, History.undo(model.history));

export const redo = (model: Model): Model => restore(model, History.redo(model.history));

// SELECTION

export const deleteSelection = (model: Model): Model => {
  if (
    (model.selection._tag === "SelectedEntity" || model.selection._tag === "SelectedEnum") &&
    model.selection.row._tag !== "Title"
  )
    return Rows.deleteCurrent(model);
  return reconcile(
    deselect(
      toIdle(
        Selection.match(model.selection, {
          NoSelection: () => model,
          SelectedEntity: ({ entityId }) =>
            commitDocument(model, (document) => Doc.deleteEntity(document, entityId)),
          SelectedEnum: ({ typeId }) =>
            commitDocument(model, (document) => Doc.deleteEnum(document, typeId)),
          SelectedAssociation: ({ associationId }) =>
            commitDocument(model, (document) => Doc.deleteAssociation(document, associationId)),
        }),
      ),
    ),
  );
};

// FILES

/** Starts an empty model that isn't tied to a file. */
export const newDocument = (model: Model): Model => ({
  ...deselect(toIdle(commitDocument(finishEditing(model), () => Doc.emptyDocument("Untitled")))),
  maybeFilePath: Option.none(),
  maybeSavedDocument: Option.none(),
  maybePendingDiskDocument: Option.none(),
  maybeDiskIssue: Option.none(),
});

export const open = (model: Model): UpdateReturn => ({
  model: finishEditing(model),
  commands: [OpenFile()],
});

// A pending change from disk is merged first, so a save never overwrites it.

export const save = (model: Model): UpdateReturn => {
  const ready = applyPending(finishEditing(model));
  return {
    model: ready,
    commands: [SaveFile({ document: present(ready), maybePath: ready.maybeFilePath })],
  };
};

export const saveAs = (model: Model): UpdateReturn => {
  const ready = applyPending(finishEditing(model));
  return { model: ready, commands: [SaveFileAs({ document: present(ready) })] };
};

export const opened = (model: Model, document: DomainModelDocument, path: string): Model => {
  // The baseline is the synced document, so filling in missing layout isn't an unsaved change.
  const synced = Doc.syncLayout(document);
  return {
    ...model,
    history: History.init(synced),
    editor: EditorState.Idle(),
    selection: Selection.NoSelection(),
    maybeFilePath: Option.some(path),
    maybeSavedDocument: Option.some(synced),
    maybePendingDiskDocument: Option.none(),
    maybeDiskIssue: Option.none(),
    maybeNotice: Option.none(),
  };
};

export const saved = (model: Model, document: DomainModelDocument, path: string): Model => ({
  ...model,
  maybeFilePath: Option.some(path),
  maybeSavedDocument: Option.some(document),
  // A change read back while the save was in flight still merges, now against what we wrote.
  maybePendingDiskDocument: Option.contains(model.maybeFilePath, path)
    ? model.maybePendingDiskDocument
    : Option.none(),
  maybeDiskIssue: Option.none(),
  maybeNotice: Option.some({ tone: "Info", text: `Saved ${fileNameOf(path)}` }),
});

export const renameDocument = (model: Model, name: string): Model =>
  name.trim() === ""
    ? model
    : commitDocument(model, (document) => Doc.renameDocument(document, name.trim()));

export const notify = (model: Model, notice: Notice): Model => ({
  ...model,
  maybeNotice: Option.some(notice),
});

// WINDOW

export const requestClose = (model: Model): UpdateReturn => ({
  model,
  commands: [ConfirmCloseWindow()],
});
