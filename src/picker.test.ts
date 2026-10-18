import { Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { FocusInput, RevealCardOption } from "./command";
import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import { bindingsFor, KEYMAP } from "./keymap";
import { Message } from "./message";
import { CardRow, EditorState, PickerPurpose, Selection, type Model } from "./model";
import { toKeyMode } from "./subscription";
import { update } from "./update";

const initial: Model = {
  history: History.init(Doc.sampleDocument),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  screen: { width: 1200, height: 800 },
  panKey: "Released",
  maybeFileName: Option.none(),
  saveStatus: "Clean",
  maybeNotice: Option.none(),
};
const step = (m: Model, msg: Message): Model => update(m, msg).model;
const opened = (m = initial): Model => step(m, Message.PressedFindCardKey());
const highlighted = (m: Model): number => {
  if (m.editor._tag !== "PickingCard") throw new Error("Expected picker");
  return m.editor.highlighted;
};

const priorSelections = [
  Selection.NoSelection(),
  Selection.SelectedEntity({ entityId: "e1", row: CardRow.Attribute({ attributeId: "p2" }) }),
  Selection.SelectedEnum({ typeId: "t1", row: CardRow.Value({ valueId: "v1" }) }),
  Selection.SelectedAssociation({ associationId: "r1" }),
];

describe("card picker", () => {
  test("opens in FIND, requests input focus, types and resets the highlight", () => {
    story(
      update,
      given(initial),
      message(Message.PressedFindCardKey()),
      Command.expectExact(FocusInput({ selector: "#card-query-input" })),
      Command.resolve(FocusInput, Message.CompletedFocusInput()),
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.PickingCard({ query: "", highlighted: 0, purpose: PickerPurpose.Focus() }),
        );
        expect(toKeyMode(m.editor)).toBe("Picking");
      }),
      message(Message.MovedCardHighlight({ direction: "Down" })),
      Command.resolve(RevealCardOption, Message.CompletedRevealCardOption()),
      model((m) => expect(highlighted(m)).toBe(1)),
      message(Message.UpdatedCardQuery({ query: "ta" })),
      Command.resolve(RevealCardOption, Message.CompletedRevealCardOption()),
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.PickingCard({ query: "ta", highlighted: 0, purpose: PickerPurpose.Focus() }),
        );
        expect(m.history).toBe(initial.history);
        expect(m.saveStatus).toBe("Clean");
      }),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.selection).toEqual(
          Selection.SelectedEntity({ entityId: "e3", row: CardRow.Title() }),
        );
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });

  test("highlight wraps both ways and stays valid with one or zero matches", () => {
    let m = opened();
    m = step(m, Message.MovedCardHighlight({ direction: "Up" }));
    expect(highlighted(m)).toBe(3);
    m = step(m, Message.MovedCardHighlight({ direction: "Down" }));
    expect(highlighted(m)).toBe(0);
    for (let index = 0; index < 4; index++)
      m = step(m, Message.MovedCardHighlight({ direction: "Down" }));
    expect(highlighted(m)).toBe(0);
    m = step(m, Message.UpdatedCardQuery({ query: "role" }));
    expect(highlighted(step(m, Message.MovedCardHighlight({ direction: "Up" })))).toBe(0);
    m = step(m, Message.UpdatedCardQuery({ query: "zzz" }));
    expect(step(m, Message.MovedCardHighlight({ direction: "Down" }))).toBe(m);
    expect(step(m, Message.PressedEnterKey())).toBe(m);
  });

  test.each(priorSelections)("cancel preserves prior selection/cursor $._tag", (selection) => {
    const start = { ...initial, selection };
    for (const cancel of [Message.PressedEscapeKey(), Message.ClickedCancelEdit()]) {
      const end = step(step(opened(start), Message.UpdatedCardQuery({ query: "zzz" })), cancel);
      expect(end.editor).toEqual(EditorState.Idle());
      expect(end.selection).toEqual(selection);
      expect(end.history).toBe(start.history);
      expect(end.saveStatus).toBe("Clean");
    }
  });

  test.each(["e1", "e3", "t1"])("focus %s keeps zoom, expansion, history and redo", (nodeId) => {
    for (const isExpanded of [true, false]) {
      for (const zoom of [0.5, 2]) {
        const document = Doc.setViewport(Doc.setExpanded(Doc.sampleDocument, nodeId, isExpanded), {
          pan: { x: 123, y: -40 },
          zoom,
        });
        const start: Model = {
          ...initial,
          history: { present: document, past: [document], future: [document] },
          saveStatus: "Dirty",
        };
        const end = step(opened(start), Message.PickedCard({ nodeId }));
        expect(end.editor).toEqual(EditorState.Idle());
        expect(end.selection).toEqual(
          nodeId === "t1"
            ? Selection.SelectedEnum({ typeId: nodeId, row: CardRow.Title() })
            : Selection.SelectedEntity({ entityId: nodeId, row: CardRow.Title() }),
        );
        const onlyCard = {
          ...document,
          entities: document.entities.filter(({ id }) => id === nodeId),
          types: document.types.filter(({ id }) => id === nodeId),
        };
        const rect = Geometry.cardRects(onlyCard)[0]!;
        const viewport = end.history.present.layout.viewport;
        expect(
          Geometry.worldToScreen(viewport, {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          }),
        ).toEqual({ x: 600, y: 400 });
        expect(viewport.zoom).toBe(zoom);
        expect(end.history.present.layout.nodes).toEqual(document.layout.nodes);
        expect(end.history.past).toBe(start.history.past);
        expect(end.history.future).toBe(start.history.future);
        expect(end.saveStatus).toBe(start.saveStatus);
      }
    }
  });

  test("opens from inspector, releases pan key and retains its selection on cancel", () => {
    const start: Model = {
      ...initial,
      editor: EditorState.EditingAssociation({ associationId: "r1" }),
      selection: priorSelections[3]!,
      panKey: "Held",
    };
    const m = opened(start);
    expect(m.panKey).toBe("Released");
    expect(m.history).toBe(start.history);
    expect(step(m, Message.PressedEscapeKey()).selection).toEqual(start.selection);
  });

  test("empty documents and filtered-out or stale picks cannot mutate a card", () => {
    const empty = opened({ ...initial, history: History.init(Doc.emptyDocument("Empty")) });
    expect(step(empty, Message.PressedEnterKey())).toBe(empty);
    const m = step(opened(), Message.UpdatedCardQuery({ query: "role" }));
    expect(step(m, Message.PickedCard({ nodeId: "e1" }))).toBe(m);
    expect(step(m, Message.PickedCard({ nodeId: "missing" }))).toBe(m);
    expect(step(initial, Message.PickedCard({ nodeId: "e1" }))).toBe(initial);
    expect(step(initial, Message.UpdatedCardQuery({ query: "foo" }))).toBe(initial);
    expect(step(initial, Message.MovedCardHighlight({ direction: "Down" }))).toBe(initial);
  });

  test("picker cannot open during text, pointer, help or chooser interactions", () => {
    for (const editor of [
      EditorState.RenamingEntity({ entityId: "e1", draftName: "Draft" }),
      EditorState.ViewingShortcuts(),
      EditorState.ChoosingNew({ position: { x: 0, y: 0 }, highlighted: "Enum" }),
      EditorState.ConnectingAssociation({
        fromEntityId: "e1",
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
      }),
    ]) {
      const start = { ...initial, editor };
      expect(opened(start)).toBe(start);
    }
  });

  test("opening a new document discards picker state and late result messages are harmless", () => {
    const start = opened();
    const end = step(
      start,
      Message.SucceededOpenFile({ document: Doc.sampleDocument, fileName: "other.json" }),
    );
    expect(end.editor).toEqual(EditorState.Idle());
    expect(step(end, Message.PickedCard({ nodeId: "e1" }))).toBe(end);
    expect(step(end, Message.CompletedRevealCardOption())).toBe(end);
  });

  test("registry restricts Find card to Normal and allows picker controls while typing", () => {
    expect(KEYMAP.find(({ id }) => id === "findCard")?.group).toBe("Navigate");
    for (const [platform, shortcut] of [
      ["Apple", "Mod+K"],
      ["Other", "Mod+Shift+K"],
    ] as const) {
      expect(
        bindingsFor("Normal", platform)
          .find(({ keys }) => keys === shortcut)
          ?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.PressedFindCardKey());
      for (const mode of ["Text", "Choosing", "Picking", "Pointer", "Help"] as const) {
        expect(bindingsFor(mode, platform).some(({ keys }) => keys === shortcut)).toBe(false);
      }
    }
    const bindings = bindingsFor("Picking");
    expect(bindings.map(({ keys }) => keys).sort()).toEqual([
      "ArrowDown",
      "ArrowUp",
      "Control+N",
      "Control+P",
      "Enter",
      "Escape",
    ]);
    expect(bindings.every(({ whileTyping }) => whileTyping === "Allow")).toBe(true);
    for (const [keys, direction] of [
      ["ArrowDown", "Down"],
      ["Control+N", "Down"],
      ["ArrowUp", "Up"],
      ["Control+P", "Up"],
    ] as const) {
      expect(
        bindings.find((binding) => binding.keys === keys)?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.MovedCardHighlight({ direction }));
    }
  });
});
