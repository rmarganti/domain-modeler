import { Array, Schema } from "effect";
import type { Dom } from "foldkit";

import { Message } from "./message";

export const KeyMode = Schema.Literals([
  "Normal",
  "Text",
  "Choosing",
  "Picking",
  "Pointer",
  "Help",
]);
export type KeyMode = typeof KeyMode.Type;
export type KeyPlatform = "Apple" | "Other";

// Match Foldkit's Mod resolution (navigator.userAgent, not navigator.platform).
export const keyPlatform: KeyPlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? "Apple"
    : "Other";

export const KEY_CONTEXTS: ReadonlyArray<Readonly<{ mode: KeyMode; label: string }>> = [
  { mode: "Normal", label: "Canvas" },
  { mode: "Text", label: "Editing text" },
  { mode: "Choosing", label: "New… chooser" },
  { mode: "Picking", label: "Card picker" },
  { mode: "Pointer", label: "Dragging / connecting" },
  { mode: "Help", label: "Keyboard shortcuts" },
];

type KeymapEntry = Readonly<{
  id: string;
  keys: ReadonlyArray<Dom.KeySequence>;
  description: string;
  displayKeys?: ReadonlyArray<Dom.KeySequence>;
  group: string;
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
    group: "File",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedNewDocumentKey(),
  },
  {
    id: "open",
    keys: ["Mod+O"],
    description: "Open",
    group: "File",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedOpenKey(),
  },
  {
    id: "save",
    keys: ["Mod+S"],
    description: "Save",
    group: "File",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedSaveKey(),
  },
  {
    id: "saveAs",
    keys: ["Mod+Shift+S"],
    description: "Save as",
    group: "File",
    modes: ["Normal", "Text", "Choosing"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedSaveAsKey(),
  },
  {
    id: "create",
    keys: ["C"],
    description: "Create entity or enum",
    group: "Create",
    modes: ["Normal"],
    mapEvent: () => Message.PressedNewKey(),
  },
  {
    id: "delete",
    keys: ["D", "Delete", "Backspace"],
    description: "Delete current row / card / relationship",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.PressedDeleteKey(),
  },
  {
    id: "undo",
    keys: ["U", "Mod+Z"],
    description: "Undo",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.PressedUndoKey(),
  },
  {
    id: "redo",
    keys: ["Control+R", "Mod+Shift+Z"],
    description: "Redo",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.PressedRedoKey(),
  },
  {
    id: "findCard",
    keys: ["Mod+K"],
    description: "Find card",
    group: "Navigate",
    modes: ["Normal"],
    mapEvent: () => Message.PressedFindCardKey(),
  },
  {
    id: "pickNext",
    keys: ["ArrowDown", "Control+N"],
    description: "Next card (wrap)",
    group: "Navigate",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.MovedCardHighlight({ direction: "Down" }),
  },
  {
    id: "pickPrevious",
    keys: ["ArrowUp", "Control+P"],
    description: "Previous card (wrap)",
    group: "Navigate",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.MovedCardHighlight({ direction: "Up" }),
  },
  {
    id: "pickCard",
    keys: ["Enter"],
    description: "Focus highlighted card",
    group: "Navigate",
    modes: ["Picking"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "nextRow",
    keys: ["J", "ArrowDown"],
    description: "Next row (expand card)",
    group: "Navigate",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Next" }),
  },
  {
    id: "previousRow",
    keys: ["K", "ArrowUp"],
    description: "Previous row",
    group: "Navigate",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Previous" }),
  },
  {
    id: "firstRow",
    keys: [["G", "G"]],
    description: "Title row",
    group: "Navigate",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "First" }),
  },
  {
    id: "lastRow",
    keys: ["Shift+G"],
    description: "Last row",
    group: "Navigate",
    modes: ["Normal"],
    mapEvent: () => Message.MovedCardRow({ motion: "Last" }),
  },
  {
    id: "insertRowBelow",
    keys: ["O"],
    description: "Add row below (first on title)",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.InsertedCardRow({ position: "Below" }),
  },
  {
    id: "insertRowAbove",
    keys: ["Shift+O"],
    description: "Add row above (first on title)",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.InsertedCardRow({ position: "Above" }),
  },
  {
    id: "reorderRowDown",
    keys: ["Shift+J"],
    description: "Move current row down",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.ReorderedCardRow({ direction: "Down" }),
  },
  {
    id: "reorderRowUp",
    keys: ["Shift+K"],
    description: "Move current row up",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.ReorderedCardRow({ direction: "Up" }),
  },
  {
    id: "edit",
    keys: ["I"],
    description: "Edit current row",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.PressedEditKey(),
  },
  {
    id: "enter",
    keys: ["Enter"],
    description: "Edit current row / close inspector",
    group: "Edit",
    modes: ["Normal"],
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "commit",
    keys: ["Enter"],
    description: "Commit edit",
    group: "Edit",
    modes: ["Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "chooseDown",
    keys: ["ArrowDown"],
    description: "Next option (wrap)",
    group: "Create",
    modes: ["Choosing"],
    mapEvent: () => Message.MovedChooserHighlight({ direction: "Down" }),
  },
  {
    id: "chooseUp",
    keys: ["ArrowUp"],
    description: "Previous option (wrap)",
    group: "Create",
    modes: ["Choosing"],
    mapEvent: () => Message.MovedChooserHighlight({ direction: "Up" }),
  },
  {
    id: "chooseEntity",
    keys: ["1"],
    description: "Create entity",
    group: "Create",
    modes: ["Choosing"],
    mapEvent: () => Message.PickedNew({ kind: "Entity" }),
  },
  {
    id: "chooseEnum",
    keys: ["2"],
    description: "Create enum",
    group: "Create",
    modes: ["Choosing"],
    mapEvent: () => Message.PickedNew({ kind: "Enum" }),
  },
  {
    id: "choose",
    keys: ["Enter"],
    description: "Pick highlighted option",
    group: "Create",
    modes: ["Choosing"],
    mapEvent: () => Message.PressedEnterKey(),
  },
  {
    id: "escape",
    keys: ["Escape"],
    description: "Cancel / deselect / close",
    group: "Navigate",
    modes: ["Normal", "Text", "Choosing", "Picking", "Pointer", "Help"],
    whileTyping: "Allow",
    mapEvent: () => Message.PressedEscapeKey(),
  },
  {
    id: "pan",
    keys: ["Space"],
    description: "Hold and drag to pan",
    group: "View",
    modes: ["Normal", "Choosing", "Pointer"],
    mapEvent: () => Message.PressedSpace(),
  },
  {
    id: "zoomIn",
    keys: ["Mod+=", "Mod+Plus", "Mod+Shift+Plus"],
    displayKeys: ["Mod+Equal", "Mod+Plus"],
    description: "Zoom in",
    group: "View",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.ClickedZoomIn(),
  },
  {
    id: "zoomOut",
    keys: ["Mod+-"],
    description: "Zoom out",
    group: "View",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.ClickedZoomOut(),
  },
  {
    id: "resetView",
    keys: ["Mod+0"],
    description: "Reset view to 100%",
    group: "View",
    modes: ["Normal", "Text"],
    whileTyping: "Allow",
    mapEvent: () => Message.ClickedResetView(),
  },
  // Foldkit matches event.key, not code: US Shift+1/2 produce !/@.
  {
    id: "fitToScreen",
    keys: ["Shift+1", "Shift+!"],
    displayKeys: ["Shift+1"],
    description: "Fit to screen",
    group: "View",
    modes: ["Normal"],
    mapEvent: () => Message.ClickedFitToScreen(),
  },
  {
    id: "zoomToSelection",
    keys: ["Shift+2", "Shift+@"],
    displayKeys: ["Shift+2"],
    description: "Zoom to selection",
    group: "View",
    modes: ["Normal"],
    mapEvent: () => Message.PressedZoomToSelectionKey(),
  },
  // Foldkit compares shiftKey exactly. Both literal and shifted ? events work.
  {
    id: "shortcuts",
    keys: ["?", "Shift+?"],
    description: "Keyboard shortcuts",
    group: "View",
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

const formatPress = (press: string, platform: KeyPlatform): string => {
  const parts = press.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  const hasCommandModifier = modifiers.some((modifier) => modifier !== "Shift");
  const isLetter = /^[a-z]$/i.test(key);
  const label =
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

export const shortcutFor = (id: string): string =>
  formatKeys(
    KEYMAP.filter((entry) => entry.id === id).flatMap((entry) => entry.displayKeys ?? entry.keys),
  );

export const shortcutTitle = (label: string, id: string): string => {
  const shortcut = shortcutFor(id);
  return shortcut === "" ? label : `${label} (${shortcut})`;
};

export const bindingsFor = (mode: KeyMode): ReadonlyArray<Dom.KeyBinding<Message>> =>
  KEYMAP.filter((entry) => entry.modes.includes(mode)).flatMap((entry) =>
    entry.keys.map((keys): Dom.KeyBinding<Message> => ({
      ...(typeof keys === "string" ? { keys } : { keys }),
      mapEvent: entry.mapEvent,
      ...(entry.whileTyping === undefined ? {} : { whileTyping: entry.whileTyping }),
    })),
  );
