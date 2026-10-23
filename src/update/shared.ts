import { Option, pipe } from "effect";
import type { Update } from "foldkit";

import { FocusInput } from "../command";
import { PICKER_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import * as History from "../domain/history";
import type { DomainModelDocument, Point, ViewportLayout } from "../domain/schema";
import type { Message } from "../message";
import { CardRow, EditorState, PickerPurpose, Selection, type Model } from "../model";

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
  return history === model.history ? model : reconcile({ ...model, history });
};

/** Applies a transient change (pan, zoom, expansion) without a snapshot. */
export const amendDocument = (
  model: Model,
  f: (document: DomainModelDocument) => DomainModelDocument,
): Model => reconcile({ ...model, history: History.amend(model.history, f) });

export const setViewport = (model: Model, next: ViewportLayout): Model =>
  amendDocument(model, (document) => Doc.setViewport(document, next));

/** Where a new card goes: centered on the viewport, as a collapsed card. */
export const newCardPosition = (model: Model): Point => {
  const center = toWorld(model, model.screen.width / 2, model.screen.height / 2);
  return {
    x: center.x - Geometry.NODE_WIDTH / 2,
    y: center.y - Geometry.NODE_HEADER_HEIGHT / 2,
  };
};

export const toggleExpanded = (model: Model, nodeId: string): Model =>
  amendDocument(model, (document) =>
    Doc.setExpanded(
      document,
      nodeId,
      !Option.exists(Doc.findNode(document, nodeId), (node) => node.isExpanded),
    ),
  );

export const toIdle = (model: Model): Model => ({ ...model, editor: EditorState.Idle() });

/** Opens a picker with an empty query and focuses its input. Pickers open from
 *  Idle, or over the relationship inspector, which they replace. */
export const openPicker = (model: Model, purpose: PickerPurpose): UpdateReturn =>
  model.editor._tag !== "Idle" && model.editor._tag !== "EditingAssociation"
    ? { model }
    : {
        model: {
          ...model,
          editor: EditorState.Picking({ query: "", highlighted: 0, purpose }),
          panKey: "Released",
        },
        commands: [focus(PICKER_INPUT_ID)],
      };

export const showShortcuts = (model: Model): UpdateReturn => ({
  model: { ...model, editor: EditorState.ViewingShortcuts(), panKey: "Released" },
  commands: [FocusInput({ selector: "#keyboard-shortcuts" })],
});

export const deselect = (model: Model): Model => ({
  ...model,
  selection: Selection.NoSelection(),
});

/** Drops a selection or edit state that refers to something no longer in the
 *  document, as happens after undo, redo, delete, or opening a file. */
export const reconcile = (model: Model): Model => {
  const document = present(model);
  const hasEntity = (entityId: string) => Option.isSome(Doc.findEntity(document, entityId));
  const hasEnum = (typeId: string) => Option.isSome(Doc.findEnum(document, typeId));
  const hasAssociation = (associationId: string) =>
    Option.isSome(Doc.findAssociation(document, associationId));

  const selection = Selection.match(model.selection, {
    NoSelection: () => model.selection,
    SelectedEntity: ({ entityId, row }) =>
      Option.match(Doc.findEntity(document, entityId), {
        onNone: () => Selection.NoSelection(),
        onSome: (entity) =>
          Selection.SelectedEntity({
            entityId,
            row:
              row._tag === "Title" ||
              (row._tag === "Attribute" &&
                Option.isSome(Doc.findAttribute(entity, row.attributeId)))
                ? row
                : CardRow.Title(),
          }),
      }),
    SelectedEnum: ({ typeId, row }) =>
      Option.match(Doc.findEnum(document, typeId), {
        onNone: () => Selection.NoSelection(),
        onSome: (definition) =>
          Selection.SelectedEnum({
            typeId,
            row:
              row._tag === "Title" ||
              (row._tag === "Value" && Option.isSome(Doc.findEnumValue(definition, row.valueId)))
                ? row
                : CardRow.Title(),
          }),
      }),
    SelectedAssociation: ({ associationId }) =>
      hasAssociation(associationId) ? model.selection : Selection.NoSelection(),
  });

  const isEditorValid = EditorState.match(model.editor, {
    Idle: () => true,
    ChoosingNew: () => true,
    Picking: ({ purpose }) =>
      PickerPurpose.match(purpose, {
        Focus: () => true,
        Connect: ({ sourceEntityId }) => hasEntity(sourceEntityId),
        RunCommand: () => true,
      }),
    ViewingShortcuts: () => true,
    CreatingEntity: () => true,
    RenamingEntity: ({ entityId }) => hasEntity(entityId),
    EditingAttribute: ({ entityId, attributeId }) =>
      pipe(
        Doc.findEntity(document, entityId),
        Option.flatMap((entity) => Doc.findAttribute(entity, attributeId)),
        Option.isSome,
      ),
    CreatingEnum: () => true,
    RenamingEnum: ({ typeId }) => hasEnum(typeId),
    EditingEnumValue: ({ typeId, valueId }) =>
      pipe(
        Doc.findEnum(document, typeId),
        Option.flatMap((definition) => Doc.findEnumValue(definition, valueId)),
        Option.isSome,
      ),
    ConnectingAssociation: ({ fromEntityId }) => hasEntity(fromEntityId),
    EditingAssociation: ({ associationId }) => hasAssociation(associationId),
    DraggingNode: ({ nodeId }) => hasEntity(nodeId) || hasEnum(nodeId),
    PanningCanvas: () => true,
  });

  return {
    ...model,
    selection,
    editor: isEditorValid ? model.editor : EditorState.Idle(),
  };
};

export const focus = (id: string) => FocusInput({ selector: `#${id}` });
