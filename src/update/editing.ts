import { Option, pipe } from "effect";

import * as Doc from "../domain/document";
import type { AttributeDefinition, EnumValue, Multiplicity, Point } from "../domain/schema";
import {
  EditorState,
  Selection,
  type Model,
  type AttributeDraft,
  type EnumValueDraft,
  type EnumValueSave,
} from "../model";
import {
  amendDocument,
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
  multiplicity: attribute.multiplicity,
  unique: attribute.unique,
});

export const attributeFromDraft = (
  attribute: AttributeDefinition,
  draft: AttributeDraft,
): AttributeDefinition => {
  const name = draft.name.trim();
  return {
    ...attribute,
    name: name === "" ? attribute.name : name,
    type: draft.type,
    multiplicity: draft.multiplicity,
    unique: draft.unique,
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

// ENUM VALUE DRAFTS

export const draftFromEnumValue = (value: EnumValue): EnumValueDraft => ({
  name: value.name,
  description: value.description ?? "",
});

export const updateEnumValueDraft = (
  model: Model,
  f: (draft: EnumValueDraft) => EnumValueDraft,
): UpdateReturn => ({
  model:
    model.editor._tag === "EditingEnumValue"
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

const commitCreateEnum = (model: Model, position: Point, draftName: string): Model => {
  const name = draftName.trim();
  if (name === "") {
    return toIdle(model);
  }
  const typeId = Doc.nextId(present(model), "t");
  return {
    ...commitDocument(model, (document) => Doc.addEnum(document, typeId, name, position)),
    editor: EditorState.Idle(),
    selection: Selection.SelectedEnum({ typeId }),
  };
};

const commitRenameEnum = (model: Model, typeId: string, draftName: string): Model => {
  const name = draftName.trim();
  return toIdle(
    name === ""
      ? model
      : commitDocument(model, (document) => Doc.renameEnum(document, typeId, name)),
  );
};

/** A blank name keeps the value's current one. */
const commitEnumValueEdit = (
  model: Model,
  typeId: string,
  valueId: string,
  draft: EnumValueDraft,
  save: EnumValueSave,
): Model =>
  pipe(
    Doc.findEnum(present(model), typeId),
    Option.flatMap((definition) => Doc.findEnumValue(definition, valueId)),
    Option.match({
      onNone: () => toIdle(model),
      onSome: (value) => {
        const name = draft.name.trim();
        const apply = save === "Amend" ? amendDocument : commitDocument;
        return toIdle(
          apply(model, (document) =>
            Doc.updateEnumValue(
              document,
              typeId,
              valueId,
              name === "" ? value.name : name,
              draft.description,
            ),
          ),
        );
      },
    }),
  );

/** Completes whatever text edit is in progress (committing it), closes the
 *  association inspector and the "New…" chooser, and returns to Idle. Pointer interactions are left
 *  alone because they complete on pointer release. */
export const finishEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => model,
    ChoosingNew: () => toIdle(model),
    CreatingEntity: ({ position, draftName }) => commitCreateEntity(model, position, draftName),
    RenamingEntity: ({ entityId, draftName }) => commitRenameEntity(model, entityId, draftName),
    EditingAttribute: ({ entityId, attributeId, draft }) =>
      commitAttributeEdit(model, entityId, attributeId, draft),
    CreatingEnum: ({ position, draftName }) => commitCreateEnum(model, position, draftName),
    RenamingEnum: ({ typeId, draftName }) => commitRenameEnum(model, typeId, draftName),
    EditingEnumValue: ({ typeId, valueId, draft, save }) =>
      commitEnumValueEdit(model, typeId, valueId, draft, save),
    EditingAssociation: () => toIdle(model),
    ConnectingAssociation: () => toIdle(model),
    DraggingNode: () => model,
    PanningCanvas: () => model,
  });

/** Abandons the edit in progress without committing it. */
export const cancelEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => deselect(model),
    ChoosingNew: () => toIdle(model),
    CreatingEntity: () => toIdle(model),
    RenamingEntity: () => toIdle(model),
    EditingAttribute: () => toIdle(model),
    CreatingEnum: () => toIdle(model),
    RenamingEnum: () => toIdle(model),
    EditingEnumValue: () => toIdle(model),
    ConnectingAssociation: () => toIdle(model),
    EditingAssociation: () => deselect(toIdle(model)),
    DraggingNode: () => toIdle(model),
    PanningCanvas: ({ startPan }) =>
      toIdle(setViewport(model, { ...viewport(model), pan: startPan })),
  });
