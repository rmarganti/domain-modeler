import { Option } from "effect";
import { Command, given, message, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { FocusInput } from "./command";
import { searchCards } from "./domain/card-search";
import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import { bindingsFor, helpSectionOf, KEYMAP } from "./keymap";
import { Message } from "./message";
import { CardRow, EditorState, PickerPurpose, Selection, type Model } from "./model";
import { toKeyMode } from "./subscription";
import { update } from "./update";
import { reconcile } from "./update/shared";
import { statusPill } from "./view/chrome";

const initial: Model = {
  history: History.init(Doc.sampleDocument),
  editor: EditorState.Idle(),
  selection: Selection.SelectedEntity({ entityId: "e1", row: CardRow.Title() }),
  screen: { width: 1200, height: 800 },
  panKey: "Released",
  maybeFileName: Option.none(),
  saveStatus: "Clean",
  maybeNotice: Option.none(),
};
const step = (model: Model, message: Message): Model => update(model, message).model;
const open = (model = initial): Model => step(model, Message.PressedConnectKey());
const query = (model: Model, query: string): Model =>
  step(model, Message.UpdatedCardQuery({ query }));
const pointerConnect = (model: Model, target: string): Model => {
  const start = Geometry.worldToScreen(model.history.present.layout.viewport, { x: 0, y: 0 });
  const end = Geometry.worldToScreen(model.history.present.layout.viewport, { x: 100, y: 100 });
  return step(
    step(
      model,
      Message.PressedPort({ entityId: "e1", button: 0, clientX: start.x, clientY: start.y }),
    ),
    Message.ReleasedPointer({
      clientX: end.x,
      clientY: end.y,
      maybeTargetEntityId: Option.some(target),
    }),
  );
};

describe("keyboard connection picker", () => {
  test.each([CardRow.Title(), CardRow.Attribute({ attributeId: "p2" })])(
    "opens from any entity cursor ($_tag), focuses input and releases Space without mutation",
    (row) => {
      const start: Model = {
        ...initial,
        selection: Selection.SelectedEntity({ entityId: "e1", row }),
        panKey: "Held",
      };
      const result = update(start, Message.PressedConnectKey());
      story(
        update,
        given(start),
        message(Message.PressedConnectKey()),
        Command.expectExact(FocusInput({ selector: "#card-query-input" })),
        Command.resolve(FocusInput, Message.CompletedFocusInput()),
      );
      expect(result.model.editor).toEqual(
        EditorState.PickingCard({
          query: "",
          highlighted: 0,
          purpose: PickerPurpose.Connect({ sourceEntityId: "e1" }),
        }),
      );
      expect(toKeyMode(result.model.editor)).toBe("Picking");
      expect(statusPill(result.model.editor).label).toBe("CONNECT");
      expect(result.model.panKey).toBe("Released");
      expect(result.model.selection).toBe(start.selection);
      expect(result.model.history).toBe(start.history);
      expect(result.model.saveStatus).toBe("Clean");
    },
  );

  test.each([
    Selection.NoSelection(),
    Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
    Selection.SelectedEnum({ typeId: "t1", row: CardRow.Value({ valueId: "v1" }) }),
    Selection.SelectedAssociation({ associationId: "r1" }),
    Selection.SelectedEntity({ entityId: "missing", row: CardRow.Title() }),
  ])("ignores nonentity or stale selection $_tag", (selection) => {
    const start = { ...initial, selection };
    expect(open(start)).toBe(start);
    expect(update(start, Message.PressedConnectKey()).commands ?? []).toEqual([]);
  });

  test("does not interrupt text, help, chooser, picker or pointer interactions", () => {
    for (const editor of [
      EditorState.RenamingEntity({ entityId: "e1", draftName: "Draft" }),
      EditorState.EditingAttribute({
        entityId: "e1",
        attributeId: "p2",
        draft: {
          name: "Draft",
          type: "String",
          multiplicity: { min: 1, max: "one" },
          unique: false,
        },
      }),
      EditorState.ViewingShortcuts(),
      EditorState.ChoosingNew({ position: { x: 0, y: 0 }, highlighted: "Entity" }),
      open().editor,
      EditorState.ConnectingAssociation({
        fromEntityId: "e1",
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
      }),
      EditorState.DraggingNode({
        nodeId: "e1",
        offset: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        position: { x: 0, y: 0 },
      }),
      EditorState.PanningCanvas({ startPan: { x: 0, y: 0 }, startMouse: { x: 0, y: 0 } }),
    ]) {
      const start = { ...initial, editor };
      expect(open(start)).toBe(start);
    }
  });

  test("entity search excludes enums before ranking and includes the source", () => {
    expect(searchCards(Doc.sampleDocument, "", "Entity").map(({ card }) => card.name)).toEqual([
      "Post",
      "Tag",
      "User",
    ]);
    expect(searchCards(Doc.sampleDocument, "role", "Entity")).toEqual([]);
    expect(searchCards(Doc.sampleDocument, "ur", "Entity")[0]).toEqual({
      card: { nodeId: "e1", name: "User", kind: "Entity" },
      indices: [0, 3],
    });
    // Focus mode still searches both kinds.
    expect(searchCards(Doc.sampleDocument, "role")[0]?.card.kind).toBe("Enum");
  });

  test("highlight wraps over entities only and query changes reset it", () => {
    let m = step(open(), Message.MovedCardHighlight({ direction: "Up" }));
    expect(m.editor).toMatchObject({ highlighted: 2 });
    m = step(m, Message.MovedCardHighlight({ direction: "Down" }));
    expect(m.editor).toMatchObject({ highlighted: 0 });
    m = step(m, Message.MovedCardHighlight({ direction: "Down" }));
    expect(m.editor).toMatchObject({ highlighted: 1 });
    m = query(m, "tag");
    expect(m.editor).toMatchObject({ highlighted: 0 });
    expect(
      step(m, Message.PressedEnterKey()).history.present.associations.at(-1)?.ends[1].entityId,
    ).toBe("e3");
  });

  test.each(["role", "zzzz"])("empty results (%s) cannot move or pick", (text) => {
    const m = query(open(), text);
    expect(step(m, Message.MovedCardHighlight({ direction: "Down" }))).toBe(m);
    expect(step(m, Message.PressedEnterKey())).toBe(m);
    expect(step(m, Message.PickedCard({ nodeId: "t1" }))).toBe(m);
    expect(step(m, Message.PickedCard({ nodeId: "e1" }))).toBe(m);
    expect(step(m, Message.PickedCard({ nodeId: "missing" }))).toBe(m);
  });

  test.each(["e3", "e1"])(
    "creates %s exactly like a deliberate pointer connection, including self",
    (target) => {
      for (const isExpanded of [true, false]) {
        const document = Doc.setViewport(Doc.setExpanded(Doc.sampleDocument, "e1", isExpanded), {
          pan: { x: 123, y: -40 },
          zoom: 2,
        });
        const start = {
          ...initial,
          history: { present: document, past: [document], future: [document] },
        };
        const before = document.associations.length;
        const result = step(
          query(open(start), target === "e3" ? "tag" : "user"),
          Message.PressedEnterKey(),
        );
        const pointer = pointerConnect(start, target);
        expect(result).toEqual(pointer);
        expect(result.history.present.associations).toHaveLength(before + 1);
        expect(result.history.present.associations.at(-1)).toEqual(
          Doc.newAssociation("r3", "e1", target),
        );
        expect(result.history.past).toHaveLength(start.history.past.length + 1);
        expect(result.history.future).toEqual([]);
        expect(result.saveStatus).toBe("Dirty");
        expect(result.selection).toEqual(Selection.SelectedAssociation({ associationId: "r3" }));
        expect(result.editor).toEqual(EditorState.EditingAssociation({ associationId: "r3" }));
        expect(result.history.present.layout).toBe(document.layout);
        expect(step(result, Message.PressedEnterKey()).history).toBe(result.history);
        const undone = step(result, Message.PressedUndoKey());
        expect(undone.history.present).toEqual(document);
        expect(undone.editor).toEqual(EditorState.Idle());
        expect(undone.selection).toEqual(Selection.NoSelection());
        expect(step(undone, Message.PressedRedoKey()).history.present).toEqual(
          result.history.present,
        );
      }
    },
  );

  test("option click shares the Enter path and late picks cannot create twice", () => {
    const start = query(open(), "tag");
    const picked = step(start, Message.PickedCard({ nodeId: "e3" }));
    expect(picked).toEqual(step(start, Message.PressedEnterKey()));
    expect(step(picked, Message.PickedCard({ nodeId: "e3" }))).toBe(picked);
  });

  test.each([Message.PressedEscapeKey(), Message.ClickedCancelEdit()])(
    "cancel ($_tag) preserves row, expansion, camera, dirty status and redo",
    (cancel) => {
      for (const isExpanded of [true, false]) {
        const document = Doc.setExpanded(Doc.sampleDocument, "e1", isExpanded);
        const start: Model = {
          ...initial,
          selection: Selection.SelectedEntity({
            entityId: "e1",
            row: CardRow.Attribute({ attributeId: "p2" }),
          }),
          history: { present: document, past: [document], future: [document] },
          saveStatus: "Dirty",
        };
        const result = step(query(open(start), "tag"), cancel);
        expect(result).toEqual(start);
        expect(result.history).toBe(start.history);
      }
    },
  );

  test("removed source invalidates Connect and stale targets cannot create dangling edges", () => {
    const opened = open();
    const sourceGone = {
      ...opened,
      history: History.init(Doc.deleteEntity(Doc.sampleDocument, "e1")),
    };
    expect(step(sourceGone, Message.PickedCard({ nodeId: "e3" }))).toBe(sourceGone);
    const valid = reconcile(sourceGone);
    expect(valid.editor).toEqual(EditorState.Idle());
    expect(valid.selection).toEqual(Selection.NoSelection());
    const targetGone = {
      ...opened,
      history: History.init(Doc.deleteEntity(Doc.sampleDocument, "e3")),
    };
    expect(step(targetGone, Message.PickedCard({ nodeId: "e3" }))).toBe(targetGone);
    const replaced = step(
      opened,
      Message.SucceededOpenFile({ document: Doc.sampleDocument, fileName: "other.json" }),
    );
    expect(replaced.editor).toEqual(EditorState.Idle());
    expect(step(replaced, Message.PickedCard({ nodeId: "e3" }))).toBe(replaced);
  });

  test("registry separates plain r from redo and suppresses it outside Normal or while typing", () => {
    expect(KEYMAP.find(({ id }) => id === "connect")?.modes).toEqual(["Normal"]);
    expect(helpSectionOf("connect")).toBe("Build");
    for (const platform of ["Apple", "Other"] as const) {
      const normal = bindingsFor("Normal", platform);
      const binding = normal.find(({ keys }) => keys === "R");
      expect(binding?.mapEvent(new KeyboardEvent("keydown"))).toEqual(Message.PressedConnectKey());
      expect(binding?.whileTyping).not.toBe("Allow");
      expect(
        normal.find(({ keys }) => keys === "Control+R")?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.PressedRedoKey());
      for (const mode of ["Text", "Choosing", "Picking", "Pointer", "Help"] as const) {
        expect(bindingsFor(mode, platform).some(({ keys }) => keys === "R")).toBe(false);
      }
    }
  });
});
