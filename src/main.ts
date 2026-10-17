import { Effect, Option, Schema } from "effect";
import type { Runtime } from "foldkit";

import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import { Message } from "./message";
import { EditorState, Model, ScreenSize, Selection } from "./model";
import { subscriptions } from "./subscription";
import { update } from "./update";
import { view } from "./view";

// FLAGS

export const Flags = Schema.Struct({ screen: ScreenSize });
export type Flags = typeof Flags.Type;

export const flags: Effect.Effect<Flags> = Effect.sync(() => ({
  screen: { width: window.innerWidth, height: window.innerHeight },
}));

// INIT

const initialDocument = (screen: ScreenSize) => {
  const document = Doc.syncLayout(Doc.sampleDocument);
  return Option.match(Geometry.documentBounds(document), {
    onNone: () => document,
    onSome: (bounds) => Doc.setViewport(document, Geometry.fitViewport(bounds, screen)),
  });
};

export const init: Runtime.ApplicationInit<Model, Message, Flags> = ({ screen }) => ({
  model: {
    history: History.init(initialDocument(screen)),
    editor: EditorState.Idle(),
    selection: Selection.NoSelection(),
    screen,
    panKey: "Released",
    maybeFileName: Option.none(),
    saveStatus: "Clean",
    maybeNotice: Option.none(),
  },
});

export { Message, Model, subscriptions, update, view };
