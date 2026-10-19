import { Effect, Option, Schema, Stream } from "effect";
import { Dom, Subscription } from "foldkit";

import { CANVAS_ID, ENTITY_ID_ATTRIBUTE } from "./dom";
import { classifyWheel } from "./domain/geometry";
import { bindingsFor, KeyMode } from "./keymap";
import { Message } from "./message";
import { EditorState, isDirty, type Model } from "./model";
import * as Files from "./platform/files";
import * as AppWindow from "./platform/window";
import { windowTitle } from "./view";

export { bindingsFor } from "./keymap";

// KEYBINDING MODES
// Each editor state activates one binding table, per the keybinding matrix.

export const toKeyMode = (editor: EditorState): KeyMode =>
  EditorState.match<KeyMode>(editor, {
    Idle: () => "Normal",
    EditingAssociation: () => "Normal",
    ChoosingNew: () => "Choosing",
    PickingCard: () => "Picking",
    ViewingShortcuts: () => "Help",
    CreatingEntity: () => "Text",
    RenamingEntity: () => "Text",
    EditingAttribute: () => "Text",
    CreatingEnum: () => "Text",
    RenamingEnum: () => "Text",
    EditingEnumValue: () => "Text",
    ConnectingAssociation: () => "Pointer",
    DraggingNode: () => "Pointer",
    PanningCanvas: () => "Pointer",
  });

// POINTER

const isTrackingPointer = (editor: EditorState): boolean =>
  editor._tag === "DraggingNode" ||
  editor._tag === "PanningCanvas" ||
  editor._tag === "ConnectingAssociation";

const entityIdUnder = (target: EventTarget | null): Option.Option<string> =>
  target instanceof Element
    ? Option.fromNullishOr(
        target
          .closest(`[data-${ENTITY_ID_ATTRIBUTE}]`)
          ?.getAttribute(`data-${ENTITY_ID_ATTRIBUTE}`),
      )
    : Option.none();

const pointerTracking = Stream.mergeAll<Message, never, never>(
  [
    Dom.streamFromEvent({
      target: window,
      type: "pointermove",
      mapEvent: (event) => Message.MovedPointer({ clientX: event.clientX, clientY: event.clientY }),
    }),
    Dom.streamFromEvent({
      target: window,
      type: "pointerup",
      mapEvent: (event) =>
        Message.ReleasedPointer({
          clientX: event.clientX,
          clientY: event.clientY,
          maybeTargetEntityId: entityIdUnder(event.target),
        }),
    }),
    Dom.streamFromEvent({
      target: window,
      type: "pointercancel",
      mapEvent: (event) =>
        Message.ReleasedPointer({
          clientX: event.clientX,
          clientY: event.clientY,
          maybeTargetEntityId: Option.none(),
        }),
    }),
  ],
  { concurrency: "unbounded" },
);

// EXTERNAL EDITS
// The open file is watched for changes, and re-checked whenever the window
// regains focus, in case the watcher missed one.

const fileChecks = (path: string): Stream.Stream<Message> =>
  Stream.merge(
    Files.changes(path).pipe(Stream.map(() => Message.ChangedFileOnDisk())),
    Dom.streamFromEvent({
      target: window,
      type: "focus",
      mapEvent: () => Message.FocusedWindow(),
    }),
  );

const isOverCanvas = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(`#${CANVAS_ID}`) !== null;

// SUBSCRIPTIONS

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  keyBindings: entry(
    { mode: KeyMode },
    {
      modelToDependencies: (model) => ({ mode: toKeyMode(model.editor) }),
      dependenciesToStream: ({ mode }) =>
        Dom.streamFromKeyBindings<Message>({ bindings: bindingsFor(mode) }),
    },
  ),

  spaceUp: Subscription.persistentEntry(
    Dom.streamFromEventFilterMap({
      target: window,
      type: "keyup",
      filterMapEvent: (event) =>
        event.key === " " ? Option.some(Message.ReleasedSpace()) : Option.none(),
    }),
  ),

  windowBlur: Subscription.persistentEntry(
    Dom.streamFromEvent({
      target: window,
      type: "blur",
      mapEvent: () => Message.ReleasedSpace(),
    }),
  ),

  pointer: entry(
    { isTracking: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isTracking: isTrackingPointer(model.editor) }),
      dependenciesToStream: ({ isTracking }) =>
        Stream.when(
          pointerTracking,
          Effect.sync(() => isTracking),
        ),
    },
  ),

  wheel: Subscription.persistentEntry(
    Dom.streamFromEventFilterMapPreventDefault({
      target: window,
      type: "wheel",
      filterMapEvent: (event) =>
        isOverCanvas(event.target)
          ? Option.some(
              Message.WheeledCanvas({
                clientX: event.clientX,
                clientY: event.clientY,
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                intent: classifyWheel(event),
              }),
            )
          : Option.none(),
    }),
  ),

  resize: Subscription.persistentEntry(
    Dom.streamFromEvent({
      target: window,
      type: "resize",
      mapEvent: () =>
        Message.ResizedScreen({ width: window.innerWidth, height: window.innerHeight }),
    }),
  ),

  closeGuard: entry(
    { isGuarded: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isGuarded: isDirty(model) }),
      dependenciesToStream: ({ isGuarded }) =>
        Stream.when(
          AppWindow.closeRequests(() => Message.RequestedWindowClose()),
          Effect.sync(() => isGuarded),
        ),
    },
  ),

  fileOnDisk: entry(
    { maybePath: Schema.Option(Schema.String) },
    {
      modelToDependencies: (model) => ({ maybePath: model.maybeFilePath }),
      dependenciesToStream: ({ maybePath }) =>
        Option.match(maybePath, { onNone: () => Stream.empty, onSome: fileChecks }),
    },
  ),

  windowTitle: entry(
    { title: Schema.String },
    {
      modelToDependencies: (model) => ({ title: windowTitle(model) }),
      dependenciesToStream: ({ title }) =>
        Stream.fromEffect(AppWindow.setTitle(title)).pipe(Stream.drain),
    },
  ),
}));
