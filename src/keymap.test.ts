import { Dom } from "foldkit";
import { describe, expect, test } from "vitest";

import { KEYMAP, KEY_CONTEXTS, bindingsFor, formatKeys, shortcutTitle } from "./keymap";

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
  });
});

describe("keybinding registry", () => {
  test("every binding has metadata and a unique id", () => {
    expect(new Set(KEYMAP.map((entry) => entry.id)).size).toBe(KEYMAP.length);
    for (const entry of KEYMAP) {
      expect(entry.description.trim()).not.toBe("");
      expect(entry.group.trim()).not.toBe("");
      expect(entry.modes.length).toBeGreaterThan(0);
      expect(entry.keys.length).toBeGreaterThan(0);
    }
  });

  test("all mode tables compile without duplicate or overlapping bindings on either platform", () => {
    for (const { mode } of KEY_CONTEXTS) {
      for (const modKey of ["Meta", "Control"] as const) {
        expect(() =>
          Dom.streamFromKeyBindings({ bindings: bindingsFor(mode), modKey }),
        ).not.toThrow();
      }
      expect(bindingsFor(mode)).toHaveLength(
        KEYMAP.filter((entry) => entry.modes.includes(mode)).flatMap((entry) => entry.keys).length,
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

  test("zoom bindings reuse HUD messages and allow typing only for Mod zoom", () => {
    const actions = [
      ["Mod+=", "ClickedZoomIn"],
      ["Mod+Plus", "ClickedZoomIn"],
      ["Mod+Shift+Plus", "ClickedZoomIn"],
      ["Mod+-", "ClickedZoomOut"],
      ["Mod+0", "ClickedResetView"],
      ["Shift+1", "ClickedFitToScreen"],
      ["Shift+!", "ClickedFitToScreen"],
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
