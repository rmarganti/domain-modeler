import { FocusInput, RevealCardOption } from "../command";
import { CARD_QUERY_INPUT_ID } from "../dom";
import { searchCards } from "../domain/card-search";
import type { MoveDirection } from "../message";
import { EditorState, PickerPurpose, type Model } from "../model";
import { focusCard } from "./canvas";
import { present, toIdle, type UpdateReturn } from "./shared";

export const open = (model: Model): UpdateReturn =>
  model.editor._tag !== "Idle" && model.editor._tag !== "EditingAssociation"
    ? { model }
    : {
        model: {
          ...model,
          editor: EditorState.PickingCard({
            query: "",
            highlighted: 0,
            purpose: PickerPurpose.Focus(),
          }),
          panKey: "Released",
        },
        commands: [FocusInput({ selector: `#${CARD_QUERY_INPUT_ID}` })],
      };

export const changeQuery = (model: Model, query: string): UpdateReturn =>
  model.editor._tag !== "PickingCard"
    ? { model }
    : {
        model: { ...model, editor: { ...model.editor, query, highlighted: 0 } },
        commands: [RevealCardOption()],
      };

export const moveHighlight = (model: Model, direction: typeof MoveDirection.Type): UpdateReturn => {
  const editor = model.editor;
  if (editor._tag !== "PickingCard") {
    return { model };
  }
  const count = searchCards(present(model), editor.query).length;
  if (count === 0) {
    return { model };
  }
  const step = direction === "Down" ? 1 : -1;
  return {
    model: {
      ...model,
      editor: { ...editor, highlighted: (editor.highlighted + step + count) % count },
    },
    commands: [RevealCardOption()],
  };
};

export const pick = (model: Model, nodeId: string): Model => {
  const editor = model.editor;
  if (
    editor._tag !== "PickingCard" ||
    !searchCards(present(model), editor.query).some(({ card }) => card.nodeId === nodeId)
  ) {
    return model;
  }
  return PickerPurpose.match(editor.purpose, {
    Focus: () => toIdle(focusCard(model, nodeId)),
  });
};

export const pickHighlighted = (model: Model): Model => {
  const editor = model.editor;
  if (editor._tag !== "PickingCard") {
    return model;
  }
  const match = searchCards(present(model), editor.query)[editor.highlighted];
  return match === undefined ? model : pick(model, match.card.nodeId);
};
