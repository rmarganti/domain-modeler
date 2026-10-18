import { Array, Option, pipe } from "effect";

import type { MoveDirection } from "../message";
import { EditorState, type Model, type NewKind } from "../model";
import { finishEditing } from "./editing";
import * as Entities from "./entities";
import * as Enums from "./enums";
import { newCardPosition, toIdle, type UpdateReturn } from "./shared";

// NEW… CHOOSER
// `c` opens a small chooser for what to create. Picking hands off to the
// regular creation states at the position captured when it opened.

/** The chooser's options, top to bottom. */
export const NEW_KINDS: ReadonlyArray<NewKind> = ["Entity", "Enum"];

export const open = (model: Model): Model => {
  const ready = finishEditing(model);
  return {
    ...ready,
    editor: EditorState.ChoosingNew({ position: newCardPosition(ready), highlighted: "Entity" }),
  };
};

/** Moves the highlight one option up or down, wrapping at either end. */
export const moveHighlight = (model: Model, direction: typeof MoveDirection.Type): Model => {
  const editor = model.editor;
  if (editor._tag !== "ChoosingNew") {
    return model;
  }
  const index = pipe(
    Array.findFirstIndex(NEW_KINDS, (kind) => kind === editor.highlighted),
    Option.getOrElse(() => 0),
  );
  const step = direction === "Down" ? 1 : -1;
  const highlighted = NEW_KINDS[(index + step + NEW_KINDS.length) % NEW_KINDS.length];
  return highlighted === undefined ? model : { ...model, editor: { ...editor, highlighted } };
};

export const pick = (model: Model, kind: NewKind): UpdateReturn => {
  if (model.editor._tag !== "ChoosingNew") {
    return { model };
  }
  const { position } = model.editor;
  return kind === "Entity"
    ? Entities.startCreatingAt(toIdle(model), position)
    : Enums.startCreatingAt(toIdle(model), position);
};
