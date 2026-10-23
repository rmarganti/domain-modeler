import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { FocusInput, RememberRecentCommands, RevealPickerOption } from "./command";
import { arrange } from "./domain/arrange";
import * as Doc from "./domain/document";
import { fuzzyMatch } from "./domain/fuzzy";
import * as History from "./domain/history";
import * as Ids from "./domain/ids";
import { KEYMAP, bindingsFor, helpSectionOf } from "./keymap";
import { Message } from "./message";
import { CardRow, EditorState, PickerPurpose, Selection, type Model } from "./model";
import { toKeyMode } from "./subscription";
import { update } from "./update";
import * as Palette from "./update/palette";
import { modeLabel } from "./view/chrome";

const initial: Model = {
  history: History.init(Doc.sampleDocument),
  idState: Ids.seed([1, 2, 3, 4]),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  screen: { width: 1200, height: 800 },
  panKey: "Released",
  maybeFilePath: Option.none(),
  maybeSavedDocument: Option.some(Doc.sampleDocument),
  maybePendingDiskDocument: Option.none(),
  maybeDiskIssue: Option.none(),
  maybeNotice: Option.none(),
  recentCommandIds: [],
};
const step = (m: Model, msg: Message): Model => update(m, msg).model;
const opened = (m = initial): Model => step(m, Message.PressedCommandPaletteKey());
const ids = (m: Model, query = ""): ReadonlyArray<string> =>
  Palette.options(m, query).map(({ command }) => command.id);
const selectedUser = (row: CardRow = CardRow.Title()) =>
  Selection.SelectedEntity({ entityId: "e1", row });

describe("command palette", () => {
  test("Mod+K opens it with the input focused, in the shared picker mode", () => {
    story(
      update,
      given(initial),
      message(Message.PressedCommandPaletteKey()),
      Command.expectExact(FocusInput({ selector: "#picker-input" })),
      Command.resolve(FocusInput, Message.CompletedFocusInput()),
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.Picking({
            query: "",
            highlighted: 0,
            purpose: PickerPurpose.RunCommand(),
          }),
        );
        expect(toKeyMode(m.editor)).toBe("Picking");
        expect(modeLabel(m.editor)).toBe("COMMAND");
      }),
    );
  });

  test("an empty query lists groups in order and hides commands that don't apply", () => {
    expect(ids(initial)).toEqual([
      "newEntity",
      "newEnum",
      "autoArrange",
      "fitToScreen",
      "resetView",
      "zoomIn",
      "zoomOut",
      "expandAll",
      "collapseAll",
      "save",
      "saveAs",
      "open",
      "newDocument",
      "findCard",
      "shortcuts",
    ]);
    expect(Palette.options(initial, "").map(({ section }) => section)).not.toContain("Selection");
  });

  test("selection commands follow what is selected", () => {
    const user = { ...initial, selection: selectedUser() };
    expect(ids(user).slice(0, 4)).toEqual(["zoomToSelection", "connect", "rename", "collapseCard"]);
    expect(ids(user)).toContain("delete");
    expect(ids(user)).not.toContain("expandCard");

    const tag = {
      ...initial,
      selection: Selection.SelectedEntity({ entityId: "e3", row: CardRow.Title() }),
    };
    expect(ids(tag)).toContain("expandCard");
    expect(ids(tag)).not.toContain("collapseCard");

    const role = {
      ...initial,
      selection: Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
    };
    expect(ids(role)).toContain("rename");
    expect(ids(role)).not.toContain("connect");

    const edge = { ...initial, selection: Selection.SelectedAssociation({ associationId: "r1" }) };
    expect(ids(edge)).toEqual(expect.arrayContaining(["zoomToSelection", "delete"]));
    expect(ids(edge)).not.toContain("rename");
    expect(ids(edge)).not.toContain("expandCard");
  });

  test("undo, redo, reload and arrange hide when they can't do anything", () => {
    const edited = step(initial, Message.ChangedDocumentName({ name: "Edited" }));
    expect(ids(edited)).toContain("undo");
    expect(ids(edited)).not.toContain("redo");
    expect(ids(step(edited, Message.RequestedUndo()))).toContain("redo");
    expect(ids({ ...initial, maybeFilePath: Option.some("/models/blog.json") })).toContain(
      "reloadFromDisk",
    );
    const empty = { ...initial, history: History.init(Doc.emptyDocument("Empty")) };
    expect(ids(empty)).not.toContain("autoArrange");
    expect(ids(empty)).not.toContain("expandAll");
  });

  test("queries rank label matches above alias matches, and report the alias", () => {
    expect(ids(initial, "arr")[0]).toBe("autoArrange");
    expect(ids(initial, "layout")[0]).toBe("autoArrange");
    const [reset] = Palette.options(initial, "actual size");
    expect(reset?.command.id).toBe("resetView");
    expect(reset?.indices).toEqual([]);
    expect(reset?.maybeAlias).toBe("actual size");
    // "fit" matches Fit to screen by label, Zoom to selection only by alias.
    const fit = Palette.options({ ...initial, selection: selectedUser() }, "fit");
    expect(fit.map(({ command }) => command.id).slice(0, 2)).toEqual([
      "fitToScreen",
      "zoomToSelection",
    ]);
    expect(fit[0]?.maybeAlias).toBeUndefined();
    expect(ids(initial, "zzz")).toEqual([]);
  });

  test("Enter runs the highlighted command, closes the palette, and remembers it", () => {
    story(
      update,
      given(opened()),
      message(Message.UpdatedPickerQuery({ query: "arrange" })),
      Command.resolve(RevealPickerOption, Message.CompletedRevealPickerOption()),
      message(Message.PressedEnterKey()),
      Command.expectExact(RememberRecentCommands({ ids: ["autoArrange"] })),
      Command.resolve(RememberRecentCommands, Message.CompletedRememberRecentCommands()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history.present.layout.nodes).toEqual(arrange(Doc.sampleDocument).layout.nodes);
        expect(m.history.past).toHaveLength(1);
        expect(m.recentCommandIds).toEqual(["autoArrange"]);
      }),
    );
  });

  test("clicking an option runs it; unavailable or unknown ids do nothing", () => {
    const m = opened();
    const fitted = step(m, Message.PickedOption({ optionId: "fitToScreen" }));
    expect(fitted.editor).toEqual(EditorState.Idle());
    expect(fitted.recentCommandIds).toEqual(["fitToScreen"]);
    expect(step(m, Message.PickedOption({ optionId: "delete" }))).toBe(m);
    expect(step(m, Message.PickedOption({ optionId: "missing" }))).toBe(m);
    expect(step(m, Message.PickedOption({ optionId: "e1" }))).toBe(m);
  });

  test("recent commands come first, newest first, deduplicated and capped", () => {
    let m = initial;
    for (const id of [
      "zoomIn",
      "zoomOut",
      "fitToScreen",
      "resetView",
      "zoomIn",
      "save",
      "shortcuts",
    ]) {
      m = step(step(opened(m), Message.PickedOption({ optionId: id })), Message.PressedEscapeKey());
    }
    expect(m.recentCommandIds).toEqual(["shortcuts", "save", "zoomIn", "resetView", "fitToScreen"]);
    const listed = Palette.options(m, "");
    expect(listed.slice(0, 5).map(({ section }) => section)).toEqual(Array(5).fill("Recent"));
    expect(listed.filter(({ command }) => command.id === "zoomIn")).toHaveLength(1);
  });

  test("recent commands that don't apply right now stay hidden", () => {
    const m = { ...initial, recentCommandIds: ["delete", "undo", "fitToScreen"] };
    expect(ids(m)[0]).toBe("fitToScreen");
    expect(ids(m)).not.toContain("delete");
  });

  test("stored recents drop unknown ids and duplicates", () => {
    expect(
      Palette.cleanRecentIds(["gone", "save", "save", "open", "undo", "redo", "zoomIn", "zoomOut"]),
    ).toEqual(["save", "open", "undo", "redo", "zoomIn"]);
  });

  test("picker commands hand over to their picker", () => {
    const find = step(opened(), Message.PickedOption({ optionId: "findCard" }));
    expect(find.editor).toEqual(
      EditorState.Picking({ query: "", highlighted: 0, purpose: PickerPurpose.Focus() }),
    );
    const connect = step(
      opened({ ...initial, selection: selectedUser() }),
      Message.PickedOption({ optionId: "connect" }),
    );
    expect(connect.editor).toEqual(
      EditorState.Picking({
        query: "",
        highlighted: 0,
        purpose: PickerPurpose.Connect({ sourceEntityId: "e1" }),
      }),
    );
    expect(step(opened(), Message.PickedOption({ optionId: "shortcuts" })).editor).toEqual(
      EditorState.ViewingShortcuts(),
    );
  });

  test("rename starts renaming the selected card, from any row", () => {
    const m = opened({
      ...initial,
      selection: selectedUser(CardRow.Attribute({ attributeId: "p2" })),
    });
    expect(step(m, Message.PickedOption({ optionId: "rename" })).editor._tag).toBe(
      "RenamingEntity",
    );
  });

  test("expand and collapse all leave history alone and reset a hidden cursor", () => {
    const start = { ...initial, selection: selectedUser(CardRow.Attribute({ attributeId: "p2" })) };
    const collapsed = step(opened(start), Message.PickedOption({ optionId: "collapseAll" }));
    expect(
      Object.values(collapsed.history.present.layout.nodes).every((node) => !node.isExpanded),
    ).toBe(true);
    expect(collapsed.selection).toEqual(selectedUser());
    expect(collapsed.history.past).toHaveLength(0);
    const expanded = step(opened(collapsed), Message.PickedOption({ optionId: "expandAll" }));
    expect(
      Object.values(expanded.history.present.layout.nodes).every((node) => node.isExpanded),
    ).toBe(true);
  });

  test("Escape closes it without running anything, keeping the selection", () => {
    const start = { ...initial, selection: selectedUser() };
    const end = step(opened(start), Message.PressedEscapeKey());
    expect(end.editor).toEqual(EditorState.Idle());
    expect(end.selection).toEqual(start.selection);
    expect(end.recentCommandIds).toEqual([]);
  });

  test("registry: unique ids, real shortcut ids, and help documents the key", () => {
    const commandIds = Palette.PALETTE_COMMANDS.map(({ id }) => id);
    expect(new Set(commandIds).size).toBe(commandIds.length);
    const keymapIds = new Set(KEYMAP.map(({ id }) => id));
    for (const { shortcutId } of Palette.PALETTE_COMMANDS) {
      if (shortcutId !== undefined) expect(keymapIds).toContain(shortcutId);
    }
    expect(helpSectionOf("commandPalette")).toBe("Move around");
    for (const [platform, keys] of [
      ["Apple", "Mod+K"],
      ["Other", "Mod+Shift+K"],
    ] as const) {
      expect(
        bindingsFor("Normal", platform)
          .find((binding) => binding.keys === keys)
          ?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.PressedCommandPaletteKey());
    }
  });
});

describe("fuzzy aliases", () => {
  const items = [
    { name: "Reset zoom", aliases: ["actual size"] },
    { name: "Actuator", aliases: [] },
  ];
  test("a name match outranks an alias match of any rank", () => {
    expect(
      fuzzyMatch(
        items,
        "actu",
        (item) => item.name,
        (item) => item.aliases,
      ).map(({ item }) => item.name),
    ).toEqual(["Actuator", "Reset zoom"]);
  });
});
