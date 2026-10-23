import { Dom } from "foldkit";
import { describe, expect, test } from "vitest";

import {
  HELP_CLOSE,
  HELP_NOTES,
  HELP_SECTIONS,
  KEYMAP,
  KEY_MODES,
  bindingsFor,
  formatKeys,
  helpChips,
  helpSectionOf,
  keysFor,
  shortcutTitle,
  type HelpItem,
} from "./keymap";

describe("formatKeys", () => {
  test("modifiers match Apple and non-Apple conventions", () => {
    expect(formatKeys(["Mod+Shift+S"], "Apple")).toBe("⌘⇧S");
    expect(formatKeys(["Control+R"], "Apple")).toBe("⌃R");
    expect(formatKeys(["Mod+Equal"], "Apple")).toBe("⌘=");
    expect(formatKeys(["Mod+Plus"], "Apple")).toBe("⌘+");
    expect(formatKeys(["Alt+ArrowDown"], "Apple")).toBe("⌥↓");
    expect(formatKeys(["Mod+Shift+S"], "Other")).toBe("Ctrl+Shift+S");
    expect(formatKeys(["Control+R"], "Other")).toBe("Ctrl+R");
    expect(formatKeys(["Mod+Equal"], "Other")).toBe("Ctrl+=");
    expect(formatKeys(["Meta+Z"], "Other")).toBe("Meta+Z");
  });

  test("letters, shifted letters and sequences", () => {
    for (const platform of ["Apple", "Other"] as const) {
      expect(formatKeys(["U"], platform)).toBe("u");
      expect(formatKeys(["Shift+J"], platform)).toBe("J");
      expect(formatKeys([["G", "G"]], platform)).toBe("g g");
      expect(formatKeys(["?", "Shift+?"], platform)).toBe("?");
    }
    expect(formatKeys(["Shift+1"], "Apple")).toBe("⇧1");
    expect(formatKeys(["Shift+1"], "Other")).toBe("Shift+1");
  });

  test("named keys and alternatives", () => {
    expect(formatKeys(["Escape", "ArrowDown", "ArrowUp", "Enter"], "Apple")).toBe(
      "Esc / ↓ / ↑ / ↵",
    );
    expect(formatKeys(["U", "Mod+Z"], "Apple")).toBe("u / ⌘Z");
    expect(formatKeys(["U", "Mod+Z"], "Other")).toBe("u / Ctrl+Z");
    expect(formatKeys(["Space", "Backspace", "Delete"], "Other")).toBe(
      "Space / Backspace / Delete",
    );
    expect(formatKeys(["D", "Delete", "Backspace"], "Apple")).toBe("d / ⌦ / ⌫");
  });
});

describe("keybinding registry", () => {
  test("every binding has metadata and a unique id", () => {
    expect(new Set(KEYMAP.map((entry) => entry.id)).size).toBe(KEYMAP.length);
    for (const entry of KEYMAP) {
      expect(entry.description.trim()).not.toBe("");
      expect(entry.modes.length).toBeGreaterThan(0);
      expect(entry.keys.length).toBeGreaterThan(0);
    }
  });

  test("all mode tables compile without duplicate or overlapping bindings on either platform", () => {
    for (const mode of KEY_MODES) {
      for (const modKey of ["Meta", "Control"] as const) {
        expect(() =>
          Dom.streamFromKeyBindings({
            bindings: bindingsFor(mode, modKey === "Meta" ? "Apple" : "Other"),
            modKey,
          }),
        ).not.toThrow();
      }
      expect(bindingsFor(mode)).toHaveLength(
        KEYMAP.filter((entry) => entry.modes.includes(mode)).flatMap((entry) => keysFor(entry))
          .length,
      );
    }
  });

  test("help supports literal and shifted question marks only in Canvas and Help contexts", () => {
    for (const mode of ["Normal", "Help"] as const) {
      for (const keys of ["?", "Shift+?"]) {
        expect(
          bindingsFor(mode)
            .find((binding) => binding.keys === keys)
            ?.mapEvent(new KeyboardEvent("keydown"))._tag,
        ).toBe("PressedShortcutsKey");
      }
    }
    for (const mode of ["Text", "Choosing", "Pointer"] as const) {
      expect(
        bindingsFor(mode).some((binding) => binding.keys === "?" || binding.keys === "Shift+?"),
      ).toBe(false);
    }
    expect(bindingsFor("Help").map((binding) => binding.keys)).toEqual(["Escape", "?", "Shift+?"]);
  });

  test("row verbs are Normal-only Build bindings, distinct from row navigation", () => {
    const actions = [
      ["O", { _tag: "InsertedCardRow", position: "Below" }],
      ["Shift+O", { _tag: "InsertedCardRow", position: "Above" }],
      ["Shift+J", { _tag: "ReorderedCardRow", direction: "Down" }],
      ["Shift+K", { _tag: "ReorderedCardRow", direction: "Up" }],
      ["J", { _tag: "MovedCardRow", motion: "Next" }],
      ["K", { _tag: "MovedCardRow", motion: "Previous" }],
      ["T", { _tag: "PressedToggleExpandKey" }],
    ] as const;
    for (const [keys, expected] of actions) {
      const binding = bindingsFor("Normal").find((binding) => binding.keys === keys);
      expect(binding?.mapEvent(new KeyboardEvent("keydown"))).toEqual(expected);
      expect(binding?.whileTyping).toBeUndefined();
      for (const mode of ["Text", "Choosing", "Pointer", "Help"] as const) {
        expect(bindingsFor(mode).some((binding) => binding.keys === keys)).toBe(false);
      }
    }
    for (const id of ["insertRowBelow", "insertRowAbove", "reorderRowDown", "reorderRowUp"]) {
      expect(helpSectionOf(id)).toBe("Build");
    }
  });

  test("zoom bindings send the shared Requested messages and allow typing only for Mod zoom", () => {
    const actions = [
      ["Mod+=", "RequestedZoomIn"],
      ["Mod+Plus", "RequestedZoomIn"],
      ["Mod+Shift+Plus", "RequestedZoomIn"],
      ["Mod+-", "RequestedZoomOut"],
      ["Mod+0", "RequestedResetView"],
      ["Shift+1", "RequestedFitToScreen"],
      ["Shift+!", "RequestedFitToScreen"],
      ["Shift+2", "PressedZoomToSelectionKey"],
      ["Shift+@", "PressedZoomToSelectionKey"],
    ];
    for (const [keys, tag] of actions) {
      const normal = bindingsFor("Normal").find((binding) => binding.keys === keys);
      expect(normal?.mapEvent(new KeyboardEvent("keydown"))._tag).toBe(tag);
      const text = bindingsFor("Text").find((binding) => binding.keys === keys);
      if (keys?.startsWith("Mod+")) {
        expect(text?.mapEvent(new KeyboardEvent("keydown"))._tag).toBe(tag);
        expect(text?.whileTyping).toBe("Allow");
        expect(normal?.whileTyping).toBe("Allow");
      } else {
        expect(text).toBeUndefined();
      }
      for (const mode of ["Choosing", "Pointer", "Help"] as const) {
        expect(bindingsFor(mode).some((binding) => binding.keys === keys)).toBe(false);
      }
    }
  });

  test("zoom display keys hide layout aliases on both platforms", () => {
    const display = (id: string, platform: "Apple" | "Other") => {
      const entry = KEYMAP.find((entry) => entry.id === id)!;
      return formatKeys(entry.displayKeys ?? entry.keys, platform);
    };
    expect(display("zoomIn", "Apple")).toBe("⌘= / ⌘+");
    expect(display("zoomIn", "Other")).toBe("Ctrl+= / Ctrl++");
    expect(display("fitToScreen", "Apple")).toBe("⇧1");
    expect(display("zoomToSelection", "Other")).toBe("Shift+2");
  });

  test("titles derive from the registry", () => {
    expect(shortcutTitle("Undo", "undo")).toMatch(/^Undo \(u \/ (⌘Z|Ctrl\+Z)\)$/);
    expect(shortcutTitle("Keyboard shortcuts", "shortcuts")).toBe("Keyboard shortcuts (?)");
    expect(shortcutTitle("Zoom in", "zoomIn")).toMatch(
      /^Zoom in \((⌘= \/ ⌘\+|Ctrl\+= \/ Ctrl\+\+)\)$/,
    );
    expect(shortcutTitle("Fit to screen", "fitToScreen")).toMatch(
      /^Fit to screen \((⇧1|Shift\+1)\)$/,
    );
  });
});

describe("help layout", () => {
  const items: ReadonlyArray<HelpItem> = [
    ...HELP_SECTIONS.flatMap((section) => section.groups.flat()),
    ...HELP_NOTES.flatMap((note) => note.items),
    HELP_CLOSE,
  ];

  test("documents every binding exactly where it names a real entry", () => {
    const ids = new Set(KEYMAP.map((entry) => entry.id));
    const shown = new Set(items.flatMap((item) => [...(item.ids ?? []), ...(item.covers ?? [])]));
    for (const id of shown) expect(ids).toContain(id);
    for (const id of ids) expect(shown).toContain(id);
  });

  test("covered entries use keys their item already shows", () => {
    for (const platform of ["Apple", "Other"] as const) {
      for (const item of items.filter((item) => item.covers !== undefined)) {
        const chips = new Set(helpChips(item, platform).flat());
        for (const id of item.covers ?? []) {
          const entry = KEYMAP.find((entry) => entry.id === id)!;
          for (const keys of keysFor(entry, platform))
            expect(chips).toContain(formatKeys([keys], platform));
        }
      }
    }
  });

  test("paired items zip alternatives; others list each alternative once", () => {
    const chips = (ids: ReadonlyArray<string>, paired?: boolean) =>
      helpChips({ label: "", ids, ...(paired ? { paired } : {}) }, "Apple");
    expect(chips(["nextRow", "previousRow"], true)).toEqual([
      ["j", "k"],
      ["↓", "↑"],
    ]);
    expect(chips(["zoomIn", "zoomOut"], true)).toEqual([["⌘=", "⌘-"]]);
    expect(chips(["firstRow", "lastRow"], true)).toEqual([["g g", "G"]]);
    expect(chips(["edit", "enter"])).toEqual([["i"], ["↵"]]);
    expect(chips(["undo"])).toEqual([["u"], ["⌘Z"]]);
    expect(chips(["shortcuts"])).toEqual([["?"]]);
    expect(helpChips({ label: "Commands", ids: ["commandPalette"] }, "Other")).toEqual([
      ["Ctrl+Shift+K"],
    ]);
    expect(helpChips({ label: "Find", ids: ["findCard"] }, "Other")).toEqual([["Ctrl+P"]]);
  });
});
