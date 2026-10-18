import { Effect, Option, Schema, Stream } from "effect";
import { Dom, Subscription } from "foldkit";

import { CANVAS_ID, ENTITY_ID_ATTRIBUTE } from "./dom";
import { classifyWheel } from "./domain/geometry";
import { Message } from "./message";
import { EditorState, type Model } from "./model";
import * as AppWindow from "./platform/window";
import { windowTitle } from "./view";

// KEYBINDING MODES
// Each editor state activates one binding table, per the keybinding matrix.

const KeyMode = Schema.Literals(["Normal", "Text", "Choosing", "Pointer"]);
type KeyMode = typeof KeyMode.Type;

export const toKeyMode = (editor: EditorState): KeyMode =>
  EditorState.match<KeyMode>(editor, {
    Idle: () => "Normal",
    EditingAssociation: () => "Normal",
    ChoosingNew: () => "Choosing",
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

const fileBindings: ReadonlyArray<Dom.KeyBinding<Message>> = [
  { keys: "Mod+N", whileTyping: "Allow", mapEvent: () => Message.PressedNewDocumentKey() },
  { keys: "Mod+S", whileTyping: "Allow", mapEvent: () => Message.PressedSaveKey() },
  { keys: "Mod+Shift+S", whileTyping: "Allow", mapEvent: () => Message.PressedSaveAsKey() },
  { keys: "Mod+O", whileTyping: "Allow", mapEvent: () => Message.PressedOpenKey() },
];

const escapeBinding: Dom.KeyBinding<Message> = {
  keys: "Escape",
  whileTyping: "Allow",
  mapEvent: () => Message.PressedEscapeKey(),
};

const normalBindings: ReadonlyArray<Dom.KeyBinding<Message>> = [
  { keys: "C", mapEvent: () => Message.PressedNewKey() },
  { keys: "D", mapEvent: () => Message.PressedDeleteKey() },
  { keys: "Delete", mapEvent: () => Message.PressedDeleteKey() },
  { keys: "Backspace", mapEvent: () => Message.PressedDeleteKey() },
  { keys: "U", mapEvent: () => Message.PressedUndoKey() },
  { keys: "Mod+Z", mapEvent: () => Message.PressedUndoKey() },
  { keys: "Control+R", mapEvent: () => Message.PressedRedoKey() },
  { keys: "Mod+Shift+Z", mapEvent: () => Message.PressedRedoKey() },
  { keys: "Enter", mapEvent: () => Message.PressedEnterKey() },
  { keys: "I", mapEvent: () => Message.PressedEditKey() },
  escapeBinding,
  ...fileBindings,
];

const textBindings: ReadonlyArray<Dom.KeyBinding<Message>> = [
  { keys: "Enter", whileTyping: "Allow", mapEvent: () => Message.PressedEnterKey() },
  escapeBinding,
  ...fileBindings,
];

const choosingBindings: ReadonlyArray<Dom.KeyBinding<Message>> = [
  { keys: "ArrowDown", mapEvent: () => Message.MovedChooserHighlight({ direction: "Down" }) },
  { keys: "ArrowUp", mapEvent: () => Message.MovedChooserHighlight({ direction: "Up" }) },
  { keys: "1", mapEvent: () => Message.PickedNew({ kind: "Entity" }) },
  { keys: "2", mapEvent: () => Message.PickedNew({ kind: "Enum" }) },
  { keys: "Enter", mapEvent: () => Message.PressedEnterKey() },
  escapeBinding,
  ...fileBindings,
];

const pointerBindings: ReadonlyArray<Dom.KeyBinding<Message>> = [escapeBinding];

export const bindingsFor = (mode: KeyMode): ReadonlyArray<Dom.KeyBinding<Message>> => {
  switch (mode) {
    case "Normal":
      return normalBindings;
    case "Text":
      return textBindings;
    case "Choosing":
      return choosingBindings;
    case "Pointer":
      return pointerBindings;
  }
};

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

  spaceDown: entry(
    { isNormalMode: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isNormalMode: toKeyMode(model.editor) !== "Text" }),
      dependenciesToStream: ({ isNormalMode }) =>
        Stream.when(
          Dom.streamFromKeyBindings<Message>({
            bindings: [{ keys: "Space", mapEvent: () => Message.PressedSpace() }],
          }),
          Effect.sync(() => isNormalMode),
        ),
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
      modelToDependencies: (model) => ({ isGuarded: model.saveStatus === "Dirty" }),
      dependenciesToStream: ({ isGuarded }) =>
        Stream.when(
          AppWindow.closeRequests(() => Message.RequestedWindowClose()),
          Effect.sync(() => isGuarded),
        ),
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
