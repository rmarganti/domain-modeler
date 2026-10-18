import { Option, pipe } from "effect";

import { ENUM_NAME_INPUT_ID, ENUM_VALUE_NAME_INPUT_ID } from "../dom";
import * as Doc from "../domain/document";
import type { Point } from "../domain/schema";
import { EditorState, Selection, type EnumValueSave, type Model } from "../model";
import { draftFromEnumValue, finishEditing } from "./editing";
import {
  amendDocument,
  commitDocument,
  focus,
  newCardPosition,
  present,
  reconcile,
  toIdle,
  type UpdateReturn,
} from "./shared";

// ENUMS

export const startCreatingAt = (model: Model, position: Point): UpdateReturn => ({
  model: {
    ...finishEditing(model),
    editor: EditorState.CreatingEnum({ position, draftName: "" }),
    selection: Selection.NoSelection(),
  },
  commands: [focus(ENUM_NAME_INPUT_ID)],
});

export const startCreating = (model: Model): UpdateReturn =>
  startCreatingAt(model, newCardPosition(model));

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

/** Selects an enum card, as following an enum-typed field to its enum does.
 *  The camera stays put. */
export const select = (model: Model, typeId: string): Model =>
  Option.isSome(Doc.findEnum(present(model), typeId))
    ? { ...toIdle(finishEditing(model)), selection: Selection.SelectedEnum({ typeId }) }
    : model;

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

export const startEditingValue = (
  model: Model,
  typeId: string,
  valueId: string,
  save: EnumValueSave = "Commit",
): UpdateReturn =>
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
            save,
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
