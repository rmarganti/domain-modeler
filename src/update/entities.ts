import { Option, pipe } from "effect";

import { ENTITY_NAME_INPUT_ID, PROPERTY_NAME_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import { EditorState, Selection, type Model } from "../model";
import { draftFromProperty, finishEditing } from "./editing";
import {
  amendDocument,
  commitDocument,
  focus,
  present,
  reconcile,
  toWorld,
  type UpdateReturn,
} from "./shared";

// ENTITIES

export const startCreating = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  const center = toWorld(ready, ready.screen.width / 2, ready.screen.height / 2);
  const position = {
    x: center.x - Geometry.COLLAPSED_NODE_WIDTH / 2,
    y: center.y - Geometry.NODE_HEADER_HEIGHT / 2,
  };
  return {
    model: {
      ...ready,
      editor: EditorState.CreatingEntity({ position, draftName: "" }),
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

/** Opens the selection for editing: expands and renames an entity, or opens
 *  the inspector for an association. */
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

// PROPERTIES

export const startEditingProperty = (
  model: Model,
  entityId: string,
  propertyId: string,
): UpdateReturn =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
    Option.match({
      onNone: () => ({ model }),
      onSome: (property) => ({
        model: {
          ...amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
          editor: EditorState.EditingProperty({
            entityId,
            propertyId,
            draft: draftFromProperty(property),
          }),
          selection: Selection.SelectedEntity({ entityId }),
        },
        commands: [focus(PROPERTY_NAME_INPUT_ID)],
      }),
    }),
  );

export const addProperty = (model: Model, entityId: string): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => {
      const ready = finishEditing(model);
      const propertyId = Doc.nextId(present(ready), "p");
      const property = Doc.newProperty(propertyId, `field${entity.properties.length + 1}`);
      return startEditingProperty(
        commitDocument(ready, (document) => Doc.addProperty(document, entityId, property)),
        entityId,
        propertyId,
      );
    },
  });

export const deleteProperty = (model: Model, entityId: string, propertyId: string): Model =>
  reconcile(
    commitDocument(model, (document) => Doc.deleteProperty(document, entityId, propertyId)),
  );
