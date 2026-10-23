import { Array, Schema } from "effect";
import type { Dom } from "foldkit";

import { Message } from "./message";

export const KEY_MODES = ["Normal", "Text", "Choosing", "Picking", "Pointer", "Help"] as const;
export const KeyMode = Schema.Literals(KEY_MODES);
export type KeyMode = typeof KeyMode.Type;
export type KeyPlatform = "Apple" | "Other";

// Match Foldkit's Mod resolution (navigator.userAgent, not navigator.platform).
export const keyPlatform: KeyPlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? "Apple"
    : "Other";

type KeymapEntry = Readonly<{
  id: string;
  keys: ReadonlyArray<Dom.KeySequence>;
  description: string;
  displayKeys?: ReadonlyArray<Dom.KeySequence>;
  otherKeys?: ReadonlyArray<Dom.KeySequence>;
  modes: ReadonlyArray<KeyMode>;
  mapEvent: (event: KeyboardEvent) => Message;
  whileTyping?: Dom.WhileTyping;
}>;

// Each keys array contains alternatives; a nested array is a key sequence.
export const KEYMAP: ReadonlyArray<KeymapEntry> = [
  {
    id: "newDocument",
    keys: ["Mod+N"],
    description: "New model",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedNewDocument(),
  },
  {
    id: "open",
    keys: ["Mod+O"],
    description: "Open",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedOpen(),
  },
  {
    id: "save",
    keys: ["Mod+S"],
    description: "Save",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedSave(),
  },
  {
    id: "saveAs",
    keys: ["Mod+Shift+S"],
    description: "Save as",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedSaveAs(),
  },
  {
    id: "reloadFromDisk",
    keys: ["Shift+R"],
    description: "Reload from disk, discarding unsaved changes",
    modes: ["Normal"],
    mapEvent: () => Message.PressedReloadFromDiskKey(),
  },
  {
    id: "create",
    keys: ["C"],
    description: "Create entity or enum",
    modes: ["Normal"],
    mapEvent: () => Message.PressedNewKey(),
  },
  {
    id: "connect",
    keys: ["R"],
    description: "Connect selected entity to…",
    modes: ["Normal"],
    mapEvent: () => Message.PressedConnectKey(),
  },
  {
    id: "delete",
    keys: ["D", "Delete", "Backspace"],
    description: "Delete current row / card / relationship",
    modes: ["Normal"],
    mapEvent: () => Message.PressedDeleteKey(),
  },
  {
    id: "undo",
    keys: ["U", "Mod+Z"],
    description: "Undo",
    modes: ["Normal"],
    mapEvent: () => Message.RequestedUndo(),
  },
  {
    id: "redo",
    keys: ["Control+R", "Mod+Shift+Z"],
    description: "Redo",
    modes: ["Normal"],
    mapEvent: () => Message.RequestedRedo(),
  },
  {
    id: "commandPalette",
    keys: ["Mod+K"],
    // Ctrl+K is spatial-up on non-Apple platforms.
    otherKeys: ["Mod+Shift+K"],
    description: "Run a command",
    modes: ["Normal"],
    mapEvent: () => Message.PressedCommandPaletteKey(),
  },
  {
    id: "findCard",
    keys: ["Mod+P"],
    description: "Find card",
    modes: ["Normal"],
    mapEvent: () => Message.PressedFindCardKey(),
  },
  {
    id: "cardLeft",
    keys: ["Control+H"],
    description: "Select card to the left",
    modes: ["Normal"],
    mapEvent: () => Message.NavigatedCard({ direction: "Left" }),
  },
  {
    id: "cardDown",
    keys: ["Control+J"],
    description: "Select card below",
    modes: ["Normal"],
    mapEvent: () => Message.NavigatedCard({ direction: "Down" }),
  },
  {
    id: "cardUp",
    keys: ["Control+K"],
    description: "Select card above",
    modes: ["Normal"],
    mapEvent: () => Message.NavigatedCard({ direction: "Up" }),
  },
  {
    id: "cardRight",
    keys: ["Control+L"],
    description: "Select card to the right",
    modes: ["Normal"],
    mapEvent: () => Message.NavigatedCard({ direction: "Right" }),
  },
  {
    id: "pickNext",
    keys: ["ArrowDown", "Control+N"],
    description: "Next option (wrap)",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.MovedPickerHighlight({ direction: "Down" }),
  },
  {
    id: "pickPrevious",
    keys: ["ArrowUp", "Control+P"],
    description: "Previous option (wrap)",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.MovedPickerHighlight({ direction: "Up" }),
  },
  {
    id: "pickCard",
    keys: ["Enter"],
    description: "Pick highlighted option",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "nextRow",
    keys: ["J", "ArrowDown"],
    description: "Next row (expand card)",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Next" }),
  },
  {
    id: "previousRow",
    keys: ["K", "ArrowUp"],
    description: "Previous row",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Previous" }),
  },
  {
    id: "firstRow",
    keys: [["G", "G"]],
    description: "Title row",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "First" }),
  },
  {
    id: "lastRow",
    keys: ["Shift+G"],
    description: "Last row",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Last" }),
  },
  {
    id: "toggleExpand",
    keys: ["T"],
    description: "Expand / collapse current card",
    modes: ["Normal"],
    mapEvent: () => Message.PressedToggleExpandKey(),
  },
  {
    id: "insertRowBelow",
    keys: ["O"],
    description: "Add row below (first on title)",
    modes: ["Normal"],
    mapEvent: () => Message.InsertedCardRow({ position: "Below" }),
  },
  {
    id: "insertRowAbove",
    keys: ["Shift+O"],
    description: "Add row above (first on title)",
    modes: ["Normal"],
    mapEvent: () => Message.InsertedCardRow({ position: "Above" }),
  },
  {
    id: "reorderRowDown",
    keys: ["Shift+J"],
    description: "Move current row down",
    modes: ["Normal"],
    mapEvent: () => Message.ReorderedCardRow({ direction: "Down" }),
  },
  {
    id: "reorderRowUp",
    keys: ["Shift+K"],
    description: "Move current row up",
    modes: ["Normal"],
    mapEvent: () => Message.ReorderedCardRow({ direction: "Up" }),
  },
  {
    id: "edit",
    keys: ["I"],
    description: "Edit current row",
    modes: ["Normal"],
    mapEvent: () => Message.PressedEditKey(),
  },
  {
    id: "enter",
    keys: ["Enter"],
    description: "Edit current row / close inspector",
    modes: ["Normal"],
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "commit",
    keys: ["Enter"],
    description: "Commit edit",
    modes: ["Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "chooseDown",
    keys: ["ArrowDown"],
    description: "Next option (wrap)",
    modes: ["Choosing"],
    mapEvent: () => Message.MovedChooserHighlight({ direction: "Down" }),
  },
  {
    id: "chooseUp",
    keys: ["ArrowUp"],
    description: "Previous option (wrap)",
    modes: ["Choosing"],
    mapEvent: () => Message.MovedChooserHighlight({ direction: "Up" }),
  },
  {
    id: "chooseEntity",
    keys: ["1"],
    description: "Create entity",
    modes: ["Choosing"],
    mapEvent: () => Message.PickedNew({ kind: "Entity" }),
  },
  {
    id: "chooseEnum",
    keys: ["2"],
    description: "Create enum",
    modes: ["Choosing"],
    mapEvent: () => Message.PickedNew({ kind: "Enum" }),
  },
  {
    id: "choose",
    keys: ["Enter"],
    description: "Pick highlighted option",
    modes: ["Choosing"],
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "escape",
    keys: ["Escape"],
    description: "Cancel / deselect / close",
    modes: ["Normal", "Text", "Choosing", "Picking", "Pointer", "Help"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEscapeKey(),
  },
  {
    id: "pan",
    keys: ["Space"],
    description: "Hold and drag to pan",
    modes: ["Normal", "Choosing", "Pointer"],
    mapEvent: () => Message.PressedSpace(),
  },
  {
    id: "zoomIn",
    keys: ["Mod+=", "Mod+Plus", "Mod+Shift+Plus"],
    displayKeys: ["Mod+Equal", "Mod+Plus"],
    description: "Zoom in",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedZoomIn(),
  },
  {
    id: "zoomOut",
    keys: ["Mod+-"],
    description: "Zoom out",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedZoomOut(),
  },
  {
    id: "resetView",
    keys: ["Mod+0"],
    description: "Reset view to 100%",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.RequestedResetView(),
  },
  // Foldkit matches event.key, not code: US Shift+1/2 produce !/@.
  {
    id: "fitToScreen",
    keys: ["Shift+1", "Shift+!"],
    displayKeys: ["Shift+1"],
    description: "Fit to screen",
    modes: ["Normal"],
    mapEvent: () => Message.RequestedFitToScreen(),
  },
  {
    id: "zoomToSelection",
    keys: ["Shift+2", "Shift+@"],
    displayKeys: ["Shift+2"],
    description: "Zoom to selection",
    modes: ["Normal"],
    mapEvent: () => Message.PressedZoomToSelectionKey(),
  },
  {
    id: "autoArrange",
    keys: ["Shift+A"],
    description: "Auto-arrange cards",
    modes: ["Normal"],
    mapEvent: () => Message.RequestedAutoArrange(),
  },
  // Foldkit compares shiftKey exactly. Both literal and shifted ? events work.
  {
    id: "shortcuts",
    keys: ["?", "Shift+?"],
    description: "Keyboard shortcuts",
    modes: ["Normal", "Help"],
    mapEvent: () => Message.PressedShortcutsKey(),
  },
];

const namedKeys: Readonly<Record<string, string>> = {
  Escape: "Esc",
  ArrowDown: "↓",
  ArrowUp: "↑",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Space: "Space",
  Equal: "=",
  Plus: "+",
  Minus: "-",
};

// Mac keyboards label these with glyphs.
const appleNamedKeys: Readonly<Record<string, string>> = {
  Backspace: "⌫",
  Delete: "⌦",
};

const formatPress = (press: string, platform: KeyPlatform): string => {
  const parts = press.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  const hasCommandModifier = modifiers.some((modifier) => modifier !== "Shift");
  const isLetter = /^[a-z]$/i.test(key);
  const label =
    (platform === "Apple" ? appleNamedKeys[key] : undefined) ??
    namedKeys[key] ??
    (isLetter ? (modifiers.length > 0 ? key.toUpperCase() : key.toLowerCase()) : key);
  const visibleModifiers = modifiers.filter(
    (modifier) => modifier !== "Shift" || hasCommandModifier || (!isLetter && key !== "?"),
  );
  const modifierLabels: Readonly<Record<string, string>> =
    platform === "Apple"
      ? { Mod: "⌘", Meta: "⌘", Control: "⌃", Shift: "⇧", Alt: "⌥" }
      : { Mod: "Ctrl", Meta: "Meta", Control: "Ctrl", Shift: "Shift", Alt: "Alt" };
  return [...visibleModifiers.map((modifier) => modifierLabels[modifier] ?? modifier), label].join(
    platform === "Apple" ? "" : "+",
  );
};

/**
 * Format alternatives, with nested arrays for sequences: ["U", "Mod+Z"], [["G", "G"]].
 */
export const formatKeys = (
  keys: ReadonlyArray<Dom.KeySequence>,
  platform: KeyPlatform = keyPlatform,
): string =>
  Array.dedupe(
    keys.map((alternative) =>
      typeof alternative === "string"
        ? formatPress(alternative, platform)
        : alternative.map((press) => formatPress(press, platform)).join(" "),
    ),
  ).join(" / ");

export const keysFor = (
  entry: KeymapEntry,
  platform: KeyPlatform = keyPlatform,
): ReadonlyArray<Dom.KeySequence> =>
  platform === "Other" ? (entry.otherKeys ?? entry.keys) : entry.keys;

export const shortcutFor = (id: string): string =>
  formatKeys(
    KEYMAP.filter((entry) => entry.id === id).flatMap(
      (entry) => entry.displayKeys ?? keysFor(entry),
    ),
  );

export const shortcutTitle = (label: string, id: string): string => {
  const shortcut = shortcutFor(id);
  return shortcut === "" ? label : `${label} (${shortcut})`;
};

export const bindingsFor = (
  mode: KeyMode,
  platform: KeyPlatform = keyPlatform,
): ReadonlyArray<Dom.KeyBinding<Message>> =>
  KEYMAP.filter((entry) => entry.modes.includes(mode)).flatMap((entry) =>
    keysFor(entry, platform).map((keys): Dom.KeyBinding<Message> => ({
      ...(typeof keys === "string" ? { keys } : { keys }),
      mapEvent: entry.mapEvent,
      ...(entry.whileTyping === undefined ? {} : { whileTyping: entry.whileTyping }),
    })),
  );

// HELP LAYOUT
// The `?` dialog is organized by task, not by key mode. Items name registry
// ids, so keys are never repeated here.

export type HelpItem = Readonly<{
  label: string;
  /** Registry entries whose keys this item shows. None: plain text. */
  ids?: ReadonlyArray<string>;
  /** Zip the entries' alternatives ("j k" or "↓ ↑") instead of listing each. */
  paired?: boolean;
  /** Entries bound to the same keys in another mode, documented by this item. */
  covers?: ReadonlyArray<string>;
  /** A pointer gesture, shown instead of keys. */
  gesture?: string;
}>;

export type HelpSection = Readonly<{
  title: string;
  column: 0 | 1 | 2;
  /** Runs of related items, separated by a divider. */
  groups: ReadonlyArray<ReadonlyArray<HelpItem>>;
}>;

export const HELP_SECTIONS: ReadonlyArray<HelpSection> = [
  {
    title: "Move around",
    column: 0,
    groups: [
      [
        { label: "Run a command", ids: ["commandPalette"] },
        { label: "Find a card", ids: ["findCard"] },
        {
          label: "Nearby card",
          ids: ["cardLeft", "cardDown", "cardUp", "cardRight"],
          paired: true,
        },
      ],
      [
        { label: "Next / previous row", ids: ["nextRow", "previousRow"], paired: true },
        { label: "First / last row", ids: ["firstRow", "lastRow"], paired: true },
        { label: "Expand / collapse card", ids: ["toggleExpand"] },
        { label: "Deselect or close", ids: ["escape"] },
      ],
    ],
  },
  {
    title: "File",
    column: 0,
    groups: [
      [
        { label: "New model", ids: ["newDocument"] },
        { label: "Open", ids: ["open"] },
        { label: "Save / save as", ids: ["save", "saveAs"], paired: true },
        { label: "Reload from disk", ids: ["reloadFromDisk"] },
      ],
    ],
  },
  {
    title: "Build",
    column: 1,
    groups: [
      [
        { label: "New entity or enum", ids: ["create"] },
        { label: "Connect entity to…", ids: ["connect"] },
      ],
      [
        { label: "Edit row", ids: ["edit", "enter"] },
        { label: "Add row below / above", ids: ["insertRowBelow", "insertRowAbove"], paired: true },
        { label: "Move row down / up", ids: ["reorderRowDown", "reorderRowUp"], paired: true },
        { label: "Delete selection", ids: ["delete"] },
      ],
      [
        { label: "Undo", ids: ["undo"] },
        { label: "Redo", ids: ["redo"] },
      ],
    ],
  },
  {
    title: "View",
    column: 2,
    groups: [
      [
        { label: "Zoom in / out", ids: ["zoomIn", "zoomOut"], paired: true },
        { label: "Actual size", ids: ["resetView"] },
        { label: "Fit all cards", ids: ["fitToScreen"] },
        { label: "Fit selection", ids: ["zoomToSelection"] },
        { label: "Pan (hold and drag)", ids: ["pan"] },
      ],
      [{ label: "Auto-arrange cards", ids: ["autoArrange"] }],
    ],
  },
  {
    title: "Mouse",
    column: 2,
    groups: [
      [
        { label: "Move a card", gesture: "Drag header" },
        { label: "Connect entities", gesture: "Drag a port" },
        { label: "Rename", gesture: "Double-click" },
        { label: "Edit relationship", gesture: "Click its line" },
        { label: "Zoom", gesture: "Wheel or pinch" },
        { label: "Pan", gesture: "Scroll or middle-drag" },
      ],
    ],
  },
];

/** The title of the section that documents a binding, if any. */
export const helpSectionOf = (id: string): string | undefined =>
  HELP_SECTIONS.find((section) => section.groups.flat().some((item) => item.ids?.includes(id)))
    ?.title;

/** One-line references for the short-lived modes, below the sections. */
export const HELP_NOTES: ReadonlyArray<
  Readonly<{ title: string; items: ReadonlyArray<HelpItem> }>
> = [
  {
    title: "While typing",
    items: [
      { label: "save", ids: ["commit"] },
      { label: "cancel", ids: ["escape"] },
      { label: "File and zoom keys still work" },
    ],
  },
  {
    title: "In menus",
    items: [
      {
        label: "move",
        ids: ["pickNext", "pickPrevious"],
        paired: true,
        covers: ["chooseDown", "chooseUp"],
      },
      { label: "pick", ids: ["pickCard"], covers: ["choose"] },
      { label: "entity / enum", ids: ["chooseEntity", "chooseEnum"], paired: true },
    ],
  },
];

/** Closes the dialog; shown in its header. */
export const HELP_CLOSE: HelpItem = { label: "close", ids: ["escape", "shortcuts"] };

/**
 * The key chips a help item shows, as alternatives of one or more chips.
 */
export const helpChips = (
  item: HelpItem,
  platform: KeyPlatform = keyPlatform,
): ReadonlyArray<ReadonlyArray<string>> => {
  const perEntry = (item.ids ?? []).map((id) => {
    const entry = KEYMAP.find((entry) => entry.id === id);
    return entry === undefined
      ? []
      : Array.dedupe(
          (entry.displayKeys ?? keysFor(entry, platform)).map((keys) =>
            formatKeys([keys], platform),
          ),
        );
  });
  if (item.paired !== true) return Array.dedupe(perEntry.flat()).map((chip) => [chip]);
  const length = Math.min(...perEntry.map((alternatives) => alternatives.length));
  return (perEntry[0] ?? [])
    .slice(0, length)
    .map((_, index) => perEntry.map((alternatives) => alternatives[index] ?? ""));
};
