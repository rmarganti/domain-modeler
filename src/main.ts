import { Effect, Option, Schema } from "effect";
import type { Runtime } from "foldkit";

import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import * as Ids from "./domain/ids";
import { Message } from "./message";
import * as Preferences from "./platform/preferences";
import { EditorState, Model, ScreenSize, Selection } from "./model";
import { subscriptions } from "./subscription";
import { update } from "./update";
import { cleanRecentIds } from "./update/palette";
import { view } from "./view";

// FLAGS

export const Flags = Schema.Struct({
  screen: ScreenSize,
  idState: Ids.IdState,
  recentCommandIds: Schema.Array(Schema.String),
});
export type Flags = typeof Flags.Type;

export const flags: Effect.Effect<Flags> = Effect.sync(() => ({
  screen: { width: window.innerWidth, height: window.innerHeight },
  idState: Ids.seed(crypto.getRandomValues(new Uint32Array(4))),
  recentCommandIds: Preferences.loadRecentCommandIds(),
}));

// INIT

const initialDocument = (screen: ScreenSize) => {
  const document = Doc.syncLayout(Doc.sampleDocument);
  return Option.match(Geometry.documentBounds(document), {
    onNone: () => document,
    onSome: (bounds) => Doc.setViewport(document, Geometry.fitViewport(bounds, screen)),
  });
};

export const init: Runtime.ApplicationInit<Model, Message, Flags> = ({
  screen,
  idState,
  recentCommandIds,
}) => {
  const document = initialDocument(screen);
  return {
    model: {
      history: History.init(document),
      idState,
      editor: EditorState.Idle(),
      selection: Selection.NoSelection(),
      screen,
      panKey: "Released",
      maybeFilePath: Option.none(),
      // The built-in sample has nothing to lose, so it starts out clean.
      maybeSavedDocument: Option.some(document),
      maybePendingDiskDocument: Option.none(),
      maybeDiskIssue: Option.none(),
      maybeNotice: Option.none(),
      recentCommandIds: cleanRecentIds(recentCommandIds),
    },
  };
};

export { Message, Model, subscriptions, update, view };
