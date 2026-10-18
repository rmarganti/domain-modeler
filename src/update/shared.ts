import { Option, pipe } from "effect";
import type { Update } from "foldkit";

import { FocusInput } from "../command";
import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import * as History from "../domain/history";
import type { DomainModelDocument, Point, ViewportLayout } from "../domain/schema";
import type { Message } from "../message";
import { EditorState, Selection, type Model } from "../model";

export type UpdateReturn = Update.Return<Model, Message>;

export const present = (model: Model): DomainModelDocument => model.history.present;

export const viewport = (model: Model): ViewportLayout => present(model).layout.viewport;

export const toWorld = (model: Model, clientX: number, clientY: number): Point =>
  Geometry.screenToWorld(viewport(model), { x: clientX, y: clientY });

/** Applies a discrete, undoable mutation to the document. */
export const commitDocument = (
  model: Model,
  f: (document: DomainModelDocument) => DomainModelDocument,
): Model => {
  const history = History.commit(model.history, f);
  return history === model.history ? model : { ...model, history, saveStatus: "Dirty" };
};

/** Applies a transient change (pan, zoom, expansion) without a snapshot. */
export const amendDocument = (
  model: Model,
  f: (document: DomainModelDocument) => DomainModelDocument,
): Model => ({ ...model, history: History.amend(model.history, f) });

export const setViewport = (model: Model, next: ViewportLayout): Model =>
  amendDocument(model, (document) => Doc.setViewport(document, next));

export const toggleExpanded = (model: Model, entityId: string): Model =>
  amendDocument(model, (document) =>
    Doc.setExpanded(
      document,
      entityId,
      !Option.exists(Doc.findNode(document, entityId), (node) => node.isExpanded),
    ),
  );

export const toIdle = (model: Model): Model => ({ ...model, editor: EditorState.Idle() });

export const deselect = (model: Model): Model => ({
  ...model,
  selection: Selection.NoSelection(),
});

/** Drops a selection or edit state that refers to something no longer in the
 *  document, as happens after undo, redo, delete, or opening a file. */
export const reconcile = (model: Model): Model => {
  const document = present(model);
  const hasEntity = (entityId: string) => Option.isSome(Doc.findEntity(document, entityId));
  const hasAssociation = (associationId: string) =>
    Option.isSome(Doc.findAssociation(document, associationId));

  const selection = Selection.match(model.selection, {
    NoSelection: () => model.selection,
    SelectedEntity: ({ entityId }) =>
      hasEntity(entityId) ? model.selection : Selection.NoSelection(),
    SelectedAssociation: ({ associationId }) =>
      hasAssociation(associationId) ? model.selection : Selection.NoSelection(),
  });

  const isEditorValid = EditorState.match(model.editor, {
    Idle: () => true,
    CreatingEntity: () => true,
    RenamingEntity: ({ entityId }) => hasEntity(entityId),
    EditingProperty: ({ entityId, propertyId }) =>
      pipe(
        Doc.findEntity(document, entityId),
        Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
        Option.isSome,
      ),
    ConnectingAssociation: ({ fromEntityId }) => hasEntity(fromEntityId),
    EditingAssociation: ({ associationId }) => hasAssociation(associationId),
    DraggingNode: ({ entityId }) => hasEntity(entityId),
    PanningCanvas: () => true,
  });

  return {
    ...model,
    selection,
    editor: isEditorValid ? model.editor : EditorState.Idle(),
  };
};

export const focus = (id: string) => FocusInput({ selector: `#${id}` });
