import { Option } from "effect";
import { describe, expect, test } from "vitest";

import * as Doc from "./domain/document";
import * as History from "./domain/history";
import { KEYMAP, bindingsFor } from "./keymap";
import { Message } from "./message";
import { CardRow, EditorState, Selection, type Model } from "./model";
import { update } from "./update";
import { commitDocument } from "./update/shared";

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
const step = (model: Model, message: Message): Model => update(model, message).model;
const move = (model: Model, motion: "Next" | "Previous" | "First" | "Last") =>
  step(model, Message.MovedCardRow({ motion }));
const entity = (row: CardRow = CardRow.Title()): Model => ({
  ...initial,
  selection: Selection.SelectedEntity({ entityId: "e1", row }),
});
const enumeration = (row: CardRow = CardRow.Title()): Model => ({
  ...initial,
  selection: Selection.SelectedEnum({ typeId: "t1", row }),
});
const currentRow = (model: Model): CardRow => {
  if (model.selection._tag !== "SelectedEntity" && model.selection._tag !== "SelectedEnum")
    throw new Error("Expected card selection");
  return model.selection.row;
};

describe("card row cursor", () => {
  test.each(["Entity", "Enum"])("%s motions stop, jump, expand and preserve history", (kind) => {
    const start = kind === "Entity" ? entity() : enumeration();
    const rows =
      kind === "Entity"
        ? [
            CardRow.Title(),
            ...Doc.sampleDocument.entities[0]!.attributes.map(({ id }) =>
              CardRow.Attribute({ attributeId: id }),
            ),
          ]
        : [
            CardRow.Title(),
            ...Doc.sampleDocument.types[0]!.values.map(({ id }) => CardRow.Value({ valueId: id })),
          ];
    const nodeId = kind === "Entity" ? "e1" : "t1";
    let m = { ...start, history: History.init(Doc.setExpanded(Doc.sampleDocument, nodeId, false)) };
    m = move(m, "Previous");
    expect(currentRow(m)).toEqual(CardRow.Title());
    expect(m.history.present.layout.nodes[nodeId]?.isExpanded).toBe(false);
    for (const row of rows.slice(1)) {
      m = move(m, "Next");
      expect(currentRow(m)).toEqual(row);
    }
    expect(m.history.present.layout.nodes[nodeId]?.isExpanded).toBe(true);
    expect(currentRow(move(m, "Next"))).toEqual(rows.at(-1));
    for (const row of rows.slice(0, -1).reverse()) {
      m = move(m, "Previous");
      expect(currentRow(m)).toEqual(row);
    }
    expect(currentRow(move(m, "Last"))).toEqual(rows.at(-1));
    expect(currentRow(move(move(m, "Last"), "First"))).toEqual(CardRow.Title());
    expect(m.history.past).toHaveLength(0);
    expect(m.saveStatus).toBe("Clean");
  });

  test.each(["Entity", "Enum"])(
    "%s t toggles from any row and collapsing resets to title",
    (kind) => {
      const nodeId = kind === "Entity" ? "e1" : "t1";
      const row =
        kind === "Entity"
          ? CardRow.Attribute({ attributeId: Doc.sampleDocument.entities[0]!.attributes[0]!.id })
          : CardRow.Value({ valueId: Doc.sampleDocument.types[0]!.values[0]!.id });
      const start = kind === "Entity" ? entity(row) : enumeration(row);
      const m = {
        ...start,
        history: History.init(Doc.setExpanded(Doc.sampleDocument, nodeId, true)),
      };
      const toggle = (model: Model) => step(model, Message.PressedToggleExpandKey());
      const collapsed = toggle(m);
      expect(collapsed.history.present.layout.nodes[nodeId]?.isExpanded).toBe(false);
      expect(currentRow(collapsed)).toEqual(CardRow.Title());
      const expanded = toggle(collapsed);
      expect(expanded.history.present.layout.nodes[nodeId]?.isExpanded).toBe(true);
      expect(currentRow(expanded)).toEqual(CardRow.Title());
      expect(expanded.history.past).toHaveLength(0);
      const fromTitle = toggle({
        ...m,
        selection:
          start.selection._tag === "SelectedEntity"
            ? Selection.SelectedEntity({ entityId: nodeId, row: CardRow.Title() })
            : Selection.SelectedEnum({ typeId: nodeId, row: CardRow.Title() }),
      });
      expect(fromTitle.history.present.layout.nodes[nodeId]?.isExpanded).toBe(false);
    },
  );

  test.each([Selection.NoSelection(), Selection.SelectedAssociation({ associationId: "r1" })])(
    "toggle ignores $._tag",
    (selection) => {
      const m = { ...initial, selection };
      expect(step(m, Message.PressedToggleExpandKey())).toBe(m);
    },
  );

  test.each([Selection.NoSelection(), Selection.SelectedAssociation({ associationId: "r1" })])(
    "motion ignores $._tag",
    (selection) => {
      const m = { ...initial, selection };
      for (const motion of ["Next", "Previous", "First", "Last"] as const)
        expect(move(m, motion)).toBe(m);
    },
  );

  test.each(["Entity", "Enum"])(
    "%s title edits expand and keep the title cursor after save/cancel",
    (kind) => {
      const start = kind === "Entity" ? entity() : enumeration();
      const opened = update(start, Message.PressedEnterKey());
      expect(opened.model.editor._tag).toBe(kind === "Entity" ? "RenamingEntity" : "RenamingEnum");
      expect(opened.commands).toHaveLength(1);
      expect(step(opened.model, Message.PressedEscapeKey()).selection).toEqual(start.selection);
      const named = step(
        opened.model,
        kind === "Entity"
          ? Message.UpdatedEntityDraftName({ name: "Person" })
          : Message.UpdatedEnumDraftName({ name: "Access" }),
      );
      expect(step(named, Message.PressedEnterKey()).selection).toEqual(start.selection);
    },
  );

  test.each(["Entity", "Enum"])("%s row edits preserve cursor on commit and cancel", (kind) => {
    const selected = move(kind === "Entity" ? entity() : enumeration(), "Next");
    const opened = update(selected, Message.PressedEditKey());
    expect(opened.model.editor._tag).toBe(
      kind === "Entity" ? "EditingAttribute" : "EditingEnumValue",
    );
    expect(opened.commands).toHaveLength(1);
    expect(step(opened.model, Message.PressedEscapeKey()).selection).toEqual(selected.selection);
    const renamed = step(
      opened.model,
      kind === "Entity"
        ? Message.UpdatedAttributeDraftName({ name: "renamed" })
        : Message.UpdatedEnumValueDraftName({ name: "renamed" }),
    );
    const saved = step(renamed, Message.PressedEnterKey());
    expect(saved.editor).toEqual(EditorState.Idle());
    expect(saved.selection).toEqual(selected.selection);
    expect(saved.history.past).toHaveLength(1);
  });

  test.each(["Entity", "Enum"])(
    "%s row deletion chooses next, previous, then title with one snapshot",
    (kind) => {
      let m = move(kind === "Entity" ? entity() : enumeration(), "Next");
      const next = currentRow(move(m, "Next"));
      const before = m.history.present;
      m = step(m, Message.PressedDeleteKey());
      expect(currentRow(m)).toEqual(next);
      expect(m.history.past).toHaveLength(1);
      expect(m.selection._tag).toBe(kind === "Entity" ? "SelectedEntity" : "SelectedEnum");
      const restored = step(m, Message.PressedUndoKey());
      expect(restored.history.present).toEqual(before);
      expect(restored.selection).toEqual(m.selection);
      m = move(m, "Last");
      const previous = currentRow(move(m, "Previous"));
      m = step(m, Message.PressedDeleteKey());
      expect(currentRow(m)).toEqual(previous);
      m = step(m, Message.PressedDeleteKey());
      expect(currentRow(m)).toEqual(CardRow.Title());
      expect(m.history.past).toHaveLength(3);
      m = step(m, Message.PressedDeleteKey());
      expect(m.selection).toEqual(Selection.NoSelection());
      expect(m.history.past).toHaveLength(4);
    },
  );

  test.each(["Entity", "Enum"])("%s newly added row falls back to title when undone", (kind) => {
    const added = step(
      initial,
      kind === "Entity"
        ? Message.ClickedAddAttribute({ entityId: "e1" })
        : Message.ClickedAddEnumValue({ typeId: "t1" }),
    );
    const saved = step(added, Message.PressedEscapeKey());
    expect(currentRow(saved)._tag).toBe(kind === "Entity" ? "Attribute" : "Value");
    expect(currentRow(step(saved, Message.PressedUndoKey()))).toEqual(CardRow.Title());
    expect(
      currentRow(step(step(saved, Message.PressedUndoKey()), Message.PressedRedoKey())),
    ).toEqual(CardRow.Title());
  });

  test("all document mutations reconcile missing rows, and undo removes missing cards", () => {
    const selected = move(entity(), "Next");
    const row = currentRow(selected);
    if (row._tag !== "Attribute") throw new Error("Expected attribute");
    expect(
      currentRow(commitDocument(selected, (d) => Doc.deleteAttribute(d, "e1", row.attributeId))),
    ).toEqual(CardRow.Title());
    const created = step(
      step(
        step(initial, Message.ClickedAddEntity()),
        Message.UpdatedEntityDraftName({ name: "New" }),
      ),
      Message.PressedEnterKey(),
    );
    expect(step(created, Message.PressedUndoKey()).selection).toEqual(Selection.NoSelection());
  });

  test("row clicks select without editing and header presses reset to title", () => {
    const selected = step(
      initial,
      Message.ClickedAttributeRow({ entityId: "e1", attributeId: "p2" }),
    );
    expect(currentRow(selected)).toEqual(CardRow.Attribute({ attributeId: "p2" }));
    expect(selected.editor).toEqual(EditorState.Idle());
    expect(
      currentRow(
        step(
          selected,
          Message.PressedNodeHeader({ entityId: "e1", button: 0, clientX: 150, clientY: 100 }),
        ),
      ),
    ).toEqual(CardRow.Title());
    const enumSelected = step(
      selected,
      Message.ClickedEnumValueRow({ typeId: "t1", valueId: "v2" }),
    );
    expect(currentRow(enumSelected)).toEqual(CardRow.Value({ valueId: "v2" }));
    expect(enumSelected.history.past).toHaveLength(0);
  });

  test("empty cards have only title, and cursor IDs survive reorder", () => {
    const empty = {
      ...entity(),
      history: History.init({
        ...Doc.sampleDocument,
        entities: Doc.sampleDocument.entities.map((e) =>
          e.id === "e1" ? { ...e, attributes: [] } : e,
        ),
      }),
    };
    expect(currentRow(move(empty, "Next"))).toEqual(CardRow.Title());
    expect(currentRow(move(empty, "Last"))).toEqual(CardRow.Title());
    const selected = move(entity(), "Next");
    const reordered = step(
      selected,
      Message.ClickedMoveAttribute({ entityId: "e1", attributeId: "p2", direction: "Down" }),
    );
    expect(reordered.selection).toEqual(selected.selection);
    expect(step(reordered, Message.PressedUndoKey()).selection).toEqual(selected.selection);
  });

  test("registry owns motions and delete aliases, only in Normal mode", () => {
    const ids = ["nextRow", "previousRow", "firstRow", "lastRow", "delete"];
    for (const entry of KEYMAP.filter((e) => ids.includes(e.id))) {
      expect(entry.modes).toEqual(["Normal"]);
      expect(entry.whileTyping).toBeUndefined();
    }
    expect(bindingsFor("Normal").find((b) => Array.isArray(b.keys))?.keys).toEqual(["G", "G"]);
    expect(KEYMAP.find((e) => e.id === "delete")?.keys).toEqual(["D", "Delete", "Backspace"]);
  });
});
