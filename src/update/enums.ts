import { Option, pipe } from "effect";

import { ENUM_NAME_INPUT_ID, ENUM_VALUE_NAME_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import { EditorState, Selection, type Model } from "../model";
import { draftFromEnumValue, finishEditing } from "./editing";
import {
  amendDocument,
  commitDocument,
  focus,
  newCardPosition,
  present,
  reconcile,
  type UpdateReturn,
} from "./shared";

// ENUMS

export const startCreating = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return {
    model: {
      ...ready,
      editor: EditorState.CreatingEnum({ position: newCardPosition(ready), draftName: "" }),
      selection: Selection.NoSelection(),
    },
    commands: [focus(ENUM_NAME_INPUT_ID)],
  };
};

export const startRenaming = (model: Model, typeId: string): UpdateReturn =>
  Option.match(Doc.findEnum(present(model), typeId), {
    onNone: () => ({ model }),
    onSome: (definition) => ({
      model: {
        ...finishEditing(model),
        editor: EditorState.RenamingEnum({ typeId, draftName: definition.name }),
        selection: Selection.SelectedEnum({ typeId }),
      },
      commands: [focus(ENUM_NAME_INPUT_ID)],
    }),
  });

export const updateDraftName = (model: Model, name: string): UpdateReturn => ({
  model: EditorState.matchOrElse(
    model.editor,
    {
      CreatingEnum: (state) => ({ ...model, editor: { ...state, draftName: name } }),
      RenamingEnum: (state) => ({ ...model, editor: { ...state, draftName: name } }),
    },
    () => model,
  ),
});

// VALUES

export const startEditingValue = (model: Model, typeId: string, valueId: string): UpdateReturn =>
  pipe(
    Doc.findEnum(present(model), typeId),
    Option.flatMap((definition) => Doc.findEnumValue(definition, valueId)),
    Option.match({
      onNone: () => ({ model }),
      onSome: (value) => ({
        model: {
          ...amendDocument(model, (document) => Doc.setExpanded(document, typeId, true)),
          editor: EditorState.EditingEnumValue({
            typeId,
            valueId,
            draft: draftFromEnumValue(value),
          }),
          selection: Selection.SelectedEnum({ typeId }),
        },
        commands: [focus(ENUM_VALUE_NAME_INPUT_ID)],
      }),
    }),
  );

export const addValue = (model: Model, typeId: string): UpdateReturn =>
  Option.match(Doc.findEnum(present(model), typeId), {
    onNone: () => ({ model }),
    onSome: (definition) => {
      const ready = finishEditing(model);
      const valueId = Doc.nextId(present(ready), "v");
      return startEditingValue(
        commitDocument(ready, (document) =>
          Doc.addEnumValue(document, typeId, {
            id: valueId,
            name: `value${definition.values.length + 1}`,
          }),
        ),
        typeId,
        valueId,
      );
    },
  });

export const deleteValue = (model: Model, typeId: string, valueId: string): Model =>
  reconcile(commitDocument(model, (document) => Doc.deleteEnumValue(document, typeId, valueId)));
