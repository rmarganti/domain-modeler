import { Option, pipe } from "effect";

import { ENTITY_NAME_INPUT_ID, ATTRIBUTE_NAME_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import * as Ids from "../domain/ids";
import type { Point } from "../domain/schema";
import { enumNameForAttribute } from "../domain/naming";
import { CardRow, EditorState, Selection, type Model } from "../model";
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

export const startCreatingAt = (model: Model, position: Point): UpdateReturn => ({
  model: {
    ...finishEditing(model),
    editor: EditorState.CreatingEntity({ position, draftName: "" }),
    selection: Selection.NoSelection(),
  },
  commands: [focus(ENTITY_NAME_INPUT_ID)],
});

export const startCreating = (model: Model): UpdateReturn =>
  startCreatingAt(model, newCardPosition(model));

export const startRenaming = (model: Model, entityId: string): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => ({
      model: {
        ...finishEditing(model),
        editor: EditorState.RenamingEntity({ entityId, draftName: entity.name }),
        selection: Selection.SelectedEntity({ entityId, row: CardRow.Title() }),
      },
      commands: [focus(ENTITY_NAME_INPUT_ID)],
    }),
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
          selection: Selection.SelectedEntity({
            entityId,
            row: CardRow.Attribute({ attributeId }),
          }),
        },
        commands: [focus(ATTRIBUTE_NAME_INPUT_ID)],
      }),
    }),
  );

export const addAttribute = (model: Model, entityId: string, index?: number): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => {
      const ready = finishEditing(model);
      const { id: attributeId, state: idState } = Ids.nextId(ready.idState, present(ready));
      const attribute = Doc.newAttribute(attributeId, `field${entity.attributes.length + 1}`);
      return startEditingAttribute(
        commitDocument({ ...ready, idState }, (document) =>
          Doc.addAttribute(document, entityId, attribute, index),
        ),
        entityId,
        attributeId,
      );
    },
  });

export const moveAttribute = (
  model: Model,
  entityId: string,
  attributeId: string,
  direction: Doc.MoveDirection,
): Model =>
  commitDocument(model, (document) =>
    Doc.moveAttribute(document, entityId, attributeId, direction),
  );

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
              const { id: typeId, state: afterType } = Ids.nextId(model.idState, present(model));
              const { id: valueId, state: idState } = Ids.nextId(afterType, present(model), [
                typeId,
              ]);
              return Enums.startEditingValue(
                commitDocument({ ...model, idState }, (document) =>
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
