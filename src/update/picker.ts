import { Option } from "effect";

import { FocusInput, RevealCardOption } from "../command";
import * as Doc from "../domain/document";
import { CARD_QUERY_INPUT_ID } from "../dom";
import { searchCards } from "../domain/card-search";
import type { MoveDirection } from "../message";
import { EditorState, PickerPurpose, type Model } from "../model";
import { create } from "./associations";
import { focusCard } from "./canvas";
import { present, toIdle, type UpdateReturn } from "./shared";

const openFor = (model: Model, purpose: PickerPurpose): UpdateReturn =>
  model.editor._tag !== "Idle" && model.editor._tag !== "EditingAssociation"
    ? { model }
    : {
        model: {
          ...model,
          editor: EditorState.PickingCard({ query: "", highlighted: 0, purpose }),
          panKey: "Released",
        },
        commands: [FocusInput({ selector: `#${CARD_QUERY_INPUT_ID}` })],
      };

export const open = (model: Model): UpdateReturn => openFor(model, PickerPurpose.Focus());

export const openConnect = (model: Model): UpdateReturn => {
  const selection = model.selection;
  return selection._tag === "SelectedEntity" &&
    Option.isSome(Doc.findEntity(present(model), selection.entityId))
    ? openFor(model, PickerPurpose.Connect({ sourceEntityId: selection.entityId }))
    : { model };
};

const matches = (model: Model, editor: Extract<EditorState, { _tag: "PickingCard" }>) =>
  searchCards(
    present(model),
    editor.query,
    editor.purpose._tag === "Connect" ? "Entity" : undefined,
  );

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
  const count = matches(model, editor).length;
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
    !matches(model, editor).some(({ card }) => card.nodeId === nodeId)
  ) {
    return model;
  }
  return PickerPurpose.match(editor.purpose, {
    Focus: () => toIdle(focusCard(model, nodeId)),
    Connect: ({ sourceEntityId }) => create(model, sourceEntityId, nodeId),
  });
};

export const pickHighlighted = (model: Model): Model => {
  const editor = model.editor;
  if (editor._tag !== "PickingCard") {
    return model;
  }
  const match = matches(model, editor)[editor.highlighted];
  return match === undefined ? model : pick(model, match.card.nodeId);
};
