import { Array, Option, pipe } from "effect";

import * as Doc from "../domain/document";
import type { AttributeDefinition, Multiplicity, Point } from "../domain/schema";
import { EditorState, Selection, type Model, type AttributeDraft } from "../model";
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

// ATTRIBUTE DRAFTS

export const draftFromAttribute = (attribute: AttributeDefinition): AttributeDraft => ({
  name: attribute.name,
  type: attribute.type,
  literalOptions: (attribute.literalOptions ?? []).join(", "),
  multiplicity: attribute.multiplicity,
  unique: attribute.unique,
});

const parseLiteralOptions = (text: string): ReadonlyArray<string> =>
  pipe(
    text.split(","),
    Array.map((option) => option.trim()),
    Array.filter((option) => option !== ""),
    Array.dedupe,
  );

export const attributeFromDraft = (
  attribute: AttributeDefinition,
  draft: AttributeDraft,
): AttributeDefinition => {
  const { literalOptions: _literalOptions, ...rest } = attribute;
  const name = draft.name.trim();
  return {
    ...rest,
    name: name === "" ? attribute.name : name,
    type: draft.type,
    multiplicity: draft.multiplicity,
    unique: draft.unique,
    ...(draft.type === "Literal"
      ? { literalOptions: parseLiteralOptions(draft.literalOptions) }
      : {}),
  };
};

/** Choosing a list multiplicity clears `unique`, since a list can't be
 *  unique. */
export const selectDraftMultiplicity = (
  draft: AttributeDraft,
  multiplicity: Multiplicity,
): AttributeDraft => ({
  ...draft,
  multiplicity,
  unique: multiplicity.max === "many" ? false : draft.unique,
});

export const toggleDraftUnique = (draft: AttributeDraft): AttributeDraft => ({
  ...draft,
  unique: draft.multiplicity.max === "many" ? false : !draft.unique,
});

export const updateAttributeDraft = (
  model: Model,
  f: (draft: AttributeDraft) => AttributeDraft,
): UpdateReturn => ({
  model:
    model.editor._tag === "EditingAttribute"
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

const commitAttributeEdit = (
  model: Model,
  entityId: string,
  attributeId: string,
  draft: AttributeDraft,
): Model =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findAttribute(entity, attributeId)),
    Option.match({
      onNone: () => toIdle(model),
      onSome: (attribute) =>
        toIdle(
          commitDocument(model, (document) =>
            Doc.replaceAttribute(document, entityId, attributeFromDraft(attribute, draft)),
          ),
        ),
    }),
  );

/** Completes whatever text edit is in progress (committing it), closes the
 *  association inspector, and returns to Idle. Pointer interactions are left
 *  alone because they complete on pointer release. */
export const finishEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => model,
    CreatingEntity: ({ position, draftName }) => commitCreateEntity(model, position, draftName),
    RenamingEntity: ({ entityId, draftName }) => commitRenameEntity(model, entityId, draftName),
    EditingAttribute: ({ entityId, attributeId, draft }) =>
      commitAttributeEdit(model, entityId, attributeId, draft),
    EditingAssociation: () => toIdle(model),
    ConnectingAssociation: () => toIdle(model),
    DraggingNode: () => model,
    PanningCanvas: () => model,
  });

/** Abandons the edit in progress without committing it. */
export const cancelEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => deselect(model),
    CreatingEntity: () => toIdle(model),
    RenamingEntity: () => toIdle(model),
    EditingAttribute: () => toIdle(model),
    ConnectingAssociation: () => toIdle(model),
    EditingAssociation: () => deselect(toIdle(model)),
    DraggingNode: () => toIdle(model),
    PanningCanvas: ({ startPan }) =>
      toIdle(setViewport(model, { ...viewport(model), pan: startPan })),
  });
