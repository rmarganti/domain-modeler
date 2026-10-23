import { Option } from "effect";

import { RevealPickerOption } from "../command";
import * as Doc from "../domain/document";
import { searchCards } from "../domain/card-search";
import type { MoveDirection } from "../message";
import { EditorState, PickerPurpose, type Model } from "../model";
import { create } from "./associations";
import { focusCard } from "./canvas";
import * as Palette from "./palette";
import { openPicker, present, toIdle, type UpdateReturn } from "./shared";

// PICKERS
// One overlay, three purposes: Find card, Connect to…, and the command palette.
// They share the query, highlight, keys, and view; only the options and what
// picking one does differ.

type PickingEditor = Extract<EditorState, { _tag: "Picking" }>;

export const open = (model: Model): UpdateReturn => openPicker(model, PickerPurpose.Focus());

export const openPalette = (model: Model): UpdateReturn =>
  openPicker(model, PickerPurpose.RunCommand());

export const openConnect = (model: Model): UpdateReturn => {
  const selection = model.selection;
  return selection._tag === "SelectedEntity" &&
    Option.isSome(Doc.findEntity(present(model), selection.entityId))
    ? openPicker(model, PickerPurpose.Connect({ sourceEntityId: selection.entityId }))
    : { model };
};

/** The ids of the options on offer, in display order. */
const optionIds = (model: Model, editor: PickingEditor): ReadonlyArray<string> =>
  PickerPurpose.match(editor.purpose, {
    Focus: () => searchCards(present(model), editor.query).map(({ card }) => card.nodeId),
    Connect: () =>
      searchCards(present(model), editor.query, "Entity").map(({ card }) => card.nodeId),
    RunCommand: () => Palette.options(model, editor.query).map(({ command }) => command.id),
  });

export const changeQuery = (model: Model, query: string): UpdateReturn =>
  model.editor._tag !== "Picking"
    ? { model }
    : {
        model: { ...model, editor: { ...model.editor, query, highlighted: 0 } },
        commands: [RevealPickerOption()],
      };

export const moveHighlight = (model: Model, direction: typeof MoveDirection.Type): UpdateReturn => {
  const editor = model.editor;
  if (editor._tag !== "Picking") {
    return { model };
  }
  const count = optionIds(model, editor).length;
  if (count === 0) {
    return { model };
  }
  const step = direction === "Down" ? 1 : -1;
  return {
    model: {
      ...model,
      editor: { ...editor, highlighted: (editor.highlighted + step + count) % count },
    },
    commands: [RevealPickerOption()],
  };
};

export const pick = (model: Model, optionId: string): UpdateReturn => {
  const editor = model.editor;
  if (editor._tag !== "Picking" || !optionIds(model, editor).includes(optionId)) {
    return { model };
  }
  return PickerPurpose.match(editor.purpose, {
    Focus: () => ({ model: toIdle(focusCard(model, optionId)) }),
    Connect: ({ sourceEntityId }) => ({ model: create(model, sourceEntityId, optionId) }),
    RunCommand: () => Palette.run(model, optionId),
  });
};

export const pickHighlighted = (model: Model): UpdateReturn => {
  const editor = model.editor;
  if (editor._tag !== "Picking") {
    return { model };
  }
  const optionId = optionIds(model, editor)[editor.highlighted];
  return optionId === undefined ? { model } : pick(model, optionId);
};
