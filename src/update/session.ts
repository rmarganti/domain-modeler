import { Option } from "effect";

import { ConfirmCloseWindow, ForgetActiveFile, OpenFile, SaveFile, SaveFileAs } from "../command";
import * as Doc from "../domain/document";
import * as History from "../domain/history";
import type { DomainModelDocument } from "../domain/schema";
import { EditorState, Selection, type Model, type Notice } from "../model";
import { finishEditing } from "./editing";
import { commitDocument, deselect, present, reconcile, toIdle, type UpdateReturn } from "./shared";

// History, selection-wide actions, files, and the window.

// HISTORY

const restore = (model: Model, maybeHistory: Option.Option<History.History>): Model =>
  Option.match(maybeHistory, {
    onNone: () => model,
    onSome: (history) => reconcile({ ...toIdle(model), history, saveStatus: "Dirty" }),
  });

export const undo = (model: Model): Model => restore(model, History.undo(model.history));

export const redo = (model: Model): Model => restore(model, History.redo(model.history));

// SELECTION

export const deleteSelection = (model: Model): Model =>
  reconcile(
    deselect(
      toIdle(
        Selection.match(model.selection, {
          NoSelection: () => model,
          SelectedEntity: ({ entityId }) =>
            commitDocument(model, (document) => Doc.deleteEntity(document, entityId)),
          SelectedAssociation: ({ associationId }) =>
            commitDocument(model, (document) => Doc.deleteAssociation(document, associationId)),
        }),
      ),
    ),
  );

// FILES

export const newDocument = (model: Model): UpdateReturn => ({
  model: deselect(
    toIdle(commitDocument(finishEditing(model), () => Doc.emptyDocument("Untitled"))),
  ),
  commands: [ForgetActiveFile()],
});

export const open = (model: Model): UpdateReturn => ({
  model: finishEditing(model),
  commands: [OpenFile()],
});

export const save = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return { model: ready, commands: [SaveFile({ document: present(ready) })] };
};

export const saveAs = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return { model: ready, commands: [SaveFileAs({ document: present(ready) })] };
};

export const opened = (model: Model, document: DomainModelDocument, fileName: string): Model => ({
  ...model,
  history: History.init(Doc.syncLayout(document)),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  maybeFileName: Option.some(fileName),
  saveStatus: "Clean",
  maybeNotice: Option.none(),
});

export const saved = (model: Model, fileName: string): Model => ({
  ...model,
  maybeFileName: Option.some(fileName),
  saveStatus: "Clean",
  maybeNotice: Option.some({ tone: "Info", text: `Saved ${fileName}` }),
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
