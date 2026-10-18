import { Option, pipe } from "effect";

import { ENTITY_NAME_INPUT_ID, ATTRIBUTE_NAME_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import { enumNameForAttribute } from "../domain/naming";
import { EditorState, Selection, type Model } from "../model";
import { attributeFromDraft, draftFromAttribute, finishEditing } from "./editing";
import * as Enums from "./enums";
import {
  amendDocument,
  commitDocument,
  focus,
  newCardPosition,
  present,
  reconcile,
  type UpdateReturn,
} from "./shared";

// ENTITIES

export const startCreating = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return {
    model: {
      ...ready,
      editor: EditorState.CreatingEntity({ position: newCardPosition(ready), draftName: "" }),
      selection: Selection.NoSelection(),
    },
    commands: [focus(ENTITY_NAME_INPUT_ID)],
  };
};

export const startRenaming = (model: Model, entityId: string): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => ({
      model: {
        ...finishEditing(model),
        editor: EditorState.RenamingEntity({ entityId, draftName: entity.name }),
        selection: Selection.SelectedEntity({ entityId }),
      },
      commands: [focus(ENTITY_NAME_INPUT_ID)],
    }),
  });

/** Opens the selection for editing: expands and renames an entity or enum,
 *  or opens the inspector for an association. */
export const editSelection = (model: Model): UpdateReturn =>
  Selection.match(model.selection, {
    NoSelection: () => ({ model }),
    SelectedAssociation: ({ associationId }) => ({
      model: { ...model, editor: EditorState.EditingAssociation({ associationId }) },
    }),
    SelectedEntity: ({ entityId }) =>
      startRenaming(
        amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
        entityId,
      ),
    SelectedEnum: ({ typeId }) =>
      Enums.startRenaming(
        amendDocument(model, (document) => Doc.setExpanded(document, typeId, true)),
        typeId,
      ),
  });

export const updateDraftName = (model: Model, name: string): UpdateReturn => ({
  model: EditorState.matchOrElse(
    model.editor,
    {
      CreatingEntity: (state) => ({ ...model, editor: { ...state, draftName: name } }),
      RenamingEntity: (state) => ({ ...model, editor: { ...state, draftName: name } }),
    },
    () => model,
  ),
});

// ATTRIBUTES

export const startEditingAttribute = (
  model: Model,
  entityId: string,
  attributeId: string,
): UpdateReturn =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findAttribute(entity, attributeId)),
    Option.match({
      onNone: () => ({ model }),
      onSome: (attribute) => ({
        model: {
          ...amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
          editor: EditorState.EditingAttribute({
            entityId,
            attributeId,
            draft: draftFromAttribute(attribute),
          }),
          selection: Selection.SelectedEntity({ entityId }),
        },
        commands: [focus(ATTRIBUTE_NAME_INPUT_ID)],
      }),
    }),
  );

export const addAttribute = (model: Model, entityId: string): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => {
      const ready = finishEditing(model);
      const attributeId = Doc.nextId(present(ready), "p");
      const attribute = Doc.newAttribute(attributeId, `field${entity.attributes.length + 1}`);
      return startEditingAttribute(
        commitDocument(ready, (document) => Doc.addAttribute(document, entityId, attribute)),
        entityId,
        attributeId,
      );
    },
  });

export const deleteAttribute = (model: Model, entityId: string, attributeId: string): Model =>
  reconcile(
    commitDocument(model, (document) => Doc.deleteAttribute(document, entityId, attributeId)),
  );

/** "New enum…" in the field type picker: one undoable step creates an enum
 *  named after the field, types the field by it with the rest of the draft
 *  saved, and opens the enum's blank first value for naming. Saving that
 *  value folds into the same step. */
export const addEnumForAttribute = (model: Model): UpdateReturn =>
  EditorState.matchOrElse(
    model.editor,
    {
      EditingAttribute: ({ entityId, attributeId, draft }) =>
        pipe(
          Doc.findEntity(present(model), entityId),
          Option.flatMap((entity) => Doc.findAttribute(entity, attributeId)),
          Option.match({
            onNone: () => ({ model }),
            onSome: (attribute) => {
              const typeId = Doc.nextId(present(model), "t");
              const valueId = Doc.nextId(present(model), "v");
              return Enums.startEditingValue(
                commitDocument(model, (document) =>
                  Doc.addEnumForAttribute(
                    document,
                    entityId,
                    attributeFromDraft(attribute, draft),
                    typeId,
                    valueId,
                    enumNameForAttribute(draft.name),
                  ),
                ),
                typeId,
                valueId,
                "Amend",
              );
            },
          }),
        ),
    },
    () => ({ model }),
  );
