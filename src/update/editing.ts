import { Array, Option, pipe } from "effect";

import * as Doc from "../domain/document";
import type { Point, PropertyDefinition } from "../domain/schema";
import type { DraftFlag } from "../message";
import { EditorState, Selection, type Model, type PropertyDraft } from "../model";
import {
  commitDocument,
  deselect,
  present,
  setViewport,
  toIdle,
  viewport,
  type UpdateReturn,
} from "./shared";

// The text-edit lifecycle shared by every area: drafts, committing, and
// cancelling whatever edit is in progress.

// PROPERTY DRAFTS

export const draftFromProperty = (property: PropertyDefinition): PropertyDraft => ({
  name: property.name,
  type: property.type,
  literalOptions: (property.literalOptions ?? []).join(", "),
  isOptional: property.isOptional,
  isNullable: property.isNullable,
});

const parseLiteralOptions = (text: string): ReadonlyArray<string> =>
  pipe(
    text.split(","),
    Array.map((option) => option.trim()),
    Array.filter((option) => option !== ""),
    Array.dedupe,
  );

export const propertyFromDraft = (
  property: PropertyDefinition,
  draft: PropertyDraft,
): PropertyDefinition => {
  const { literalOptions: _literalOptions, ...rest } = property;
  const name = draft.name.trim();
  return {
    ...rest,
    name: name === "" ? property.name : name,
    type: draft.type,
    isOptional: draft.isOptional,
    isNullable: draft.isNullable,
    ...(draft.type === "Literal"
      ? { literalOptions: parseLiteralOptions(draft.literalOptions) }
      : {}),
  };
};

export const toggleDraftFlag = (draft: PropertyDraft, flag: DraftFlag): PropertyDraft => ({
  ...draft,
  [flag]: !draft[flag],
});

export const updatePropertyDraft = (
  model: Model,
  f: (draft: PropertyDraft) => PropertyDraft,
): UpdateReturn => ({
  model:
    model.editor._tag === "EditingProperty"
      ? { ...model, editor: { ...model.editor, draft: f(model.editor.draft) } }
      : model,
});

// COMMITTING

const commitCreateEntity = (model: Model, position: Point, draftName: string): Model => {
  const name = draftName.trim();
  if (name === "") {
    return toIdle(model);
  }
  const entityId = Doc.nextId(present(model), "e");
  return {
    ...commitDocument(model, (document) => Doc.addEntity(document, entityId, name, position)),
    editor: EditorState.Idle(),
    selection: Selection.SelectedEntity({ entityId }),
  };
};

const commitRenameEntity = (model: Model, entityId: string, draftName: string): Model => {
  const name = draftName.trim();
  return toIdle(
    name === ""
      ? model
      : commitDocument(model, (document) => Doc.renameEntity(document, entityId, name)),
  );
};

const commitPropertyEdit = (
  model: Model,
  entityId: string,
  propertyId: string,
  draft: PropertyDraft,
): Model =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
    Option.match({
      onNone: () => toIdle(model),
      onSome: (property) =>
        toIdle(
          commitDocument(model, (document) =>
            Doc.replaceProperty(document, entityId, propertyFromDraft(property, draft)),
          ),
        ),
    }),
  );

/** Completes whatever text edit is in progress (committing it), closes the
 *  relationship inspector, and returns to Idle. Pointer interactions are left
 *  alone because they complete on pointer release. */
export const finishEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => model,
    CreatingEntity: ({ position, draftName }) => commitCreateEntity(model, position, draftName),
    RenamingEntity: ({ entityId, draftName }) => commitRenameEntity(model, entityId, draftName),
    EditingProperty: ({ entityId, propertyId, draft }) =>
      commitPropertyEdit(model, entityId, propertyId, draft),
    EditingRelationship: () => toIdle(model),
    ConnectingRelationship: () => toIdle(model),
    DraggingNode: () => model,
    PanningCanvas: () => model,
  });

/** Abandons the edit in progress without committing it. */
export const cancelEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => deselect(model),
    CreatingEntity: () => toIdle(model),
    RenamingEntity: () => toIdle(model),
    EditingProperty: () => toIdle(model),
    ConnectingRelationship: () => toIdle(model),
    EditingRelationship: () => deselect(toIdle(model)),
    DraggingNode: () => toIdle(model),
    PanningCanvas: ({ startPan }) =>
      toIdle(setViewport(model, { ...viewport(model), pan: startPan })),
  });
