import { Option, Schema } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import {
  CheckFileOnDisk,
  ConfirmCloseWindow,
  FocusInput,
  OpenFile,
  ReloadFileFromDisk,
  SaveFile,
} from "./command";
import * as Doc from "./domain/document";
import * as History from "./domain/history";
import * as Ids from "./domain/ids";
import * as Geometry from "./domain/geometry";
import { DomainModelDocumentJsonString } from "./domain/schema";
import { Message } from "./message";
import { CardRow, EditorState, Selection, isDirty, maybeFileName, type Model } from "./model";
import { bindingsFor, toKeyMode } from "./subscription";
import { update } from "./update";

// Viewport at pan (0, 0) and zoom 1, so screen and world coordinates match.
const baseModel: Model = {
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
};

// New IDs are random, so tests find what an action created instead of naming it.
const lastEntity = (m: Model) => m.history.present.entities.at(-1)!;
const lastEnum = (m: Model) => m.history.present.types.at(-1)!;
const lastAssociation = (m: Model) => m.history.present.associations.at(-1)!;

const focused = Command.resolve(FocusInput, Message.CompletedFocusInput());

const press = { button: 0, clientX: 0, clientY: 0 };

describe("node dragging", () => {
  test("a drag moves the node and records one snapshot on release", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNodeHeader({ entityId: "e3", ...press, clientX: 1000, clientY: 150 })),
      model((m) => expect(m.editor._tag).toBe("DraggingNode")),
      message(Message.MovedPointer({ clientX: 1050, clientY: 200 })),
      message(Message.MovedPointer({ clientX: 1100, clientY: 250 })),
      model((m) => {
        // Transient moves never touch history.
        expect(m.history.past).toHaveLength(0);
        expect(m.history.present.layout.nodes["e3"]?.position).toEqual({ x: 980, y: 140 });
      }),
      message(
        Message.ReleasedPointer({
          clientX: 1100,
          clientY: 250,
          maybeTargetEntityId: Option.none(),
        }),
      ),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history.past).toHaveLength(1);
        expect(m.history.present.layout.nodes["e3"]?.position).toEqual({ x: 1080, y: 240 });
        expect(m.selection).toEqual(
          Selection.SelectedEntity({ entityId: "e3", row: CardRow.Title() }),
        );
        expect(isDirty(m)).toBe(true);
      }),
    );
  });

  test("a press and release without movement selects without toggling or history", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNodeHeader({ entityId: "e3", ...press, clientX: 1000, clientY: 150 })),
      message(
        Message.ReleasedPointer({
          clientX: 1001,
          clientY: 150,
          maybeTargetEntityId: Option.none(),
        }),
      ),
      model((m) => {
        expect(m.history.present.layout.nodes["e3"]?.isExpanded).toBe(false);
        expect(m.history.present.layout.nodes["e3"]?.position).toEqual({ x: 980, y: 140 });
        expect(m.selection).toEqual(
          Selection.SelectedEntity({ entityId: "e3", row: CardRow.Title() }),
        );
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });

  test("Escape abandons a drag", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNodeHeader({ entityId: "e3", ...press, clientX: 1000, clientY: 150 })),
      message(Message.MovedPointer({ clientX: 1300, clientY: 450 })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history.present.layout.nodes["e3"]?.position).toEqual({ x: 980, y: 140 });
      }),
    );
  });
});

describe("canvas", () => {
  test("middle-drag pans without recording history", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedCanvas({ button: 1, clientX: 100, clientY: 100 })),
      model((m) => expect(m.editor._tag).toBe("PanningCanvas")),
      message(Message.MovedPointer({ clientX: 160, clientY: 70 })),
      message(
        Message.ReleasedPointer({ clientX: 160, clientY: 70, maybeTargetEntityId: Option.none() }),
      ),
      model((m) => {
        expect(m.history.present.layout.viewport.pan).toEqual({ x: 60, y: -30 });
        expect(m.history.past).toHaveLength(0);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });

  test("Space + primary drag pans, even over a node", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedSpace()),
      message(Message.PressedNodeHeader({ entityId: "e1", ...press })),
      model((m) => expect(m.editor._tag).toBe("PanningCanvas")),
    );
  });

  test("wheel zoom keeps the point under the cursor fixed", () => {
    story(
      update,
      given(baseModel),
      message(
        Message.WheeledCanvas({
          clientX: 200,
          clientY: 100,
          deltaX: 0,
          deltaY: -100,
          intent: "Zoom",
        }),
      ),
      model((m) => {
        const { pan, zoom } = m.history.present.layout.viewport;
        expect(zoom).toBeGreaterThan(1);
        expect((200 - pan.x) / zoom).toBeCloseTo(200);
        expect((100 - pan.y) / zoom).toBeCloseTo(100);
      }),
    );
  });

  test("pressing empty canvas deselects", () => {
    story(
      update,
      given({
        ...baseModel,
        selection: Selection.SelectedEntity({ entityId: "e1", row: CardRow.Title() }),
      }),
      message(Message.PressedCanvas(press)),
      model((m) => expect(m.selection).toEqual(Selection.NoSelection())),
    );
  });
});

describe("zoom shortcuts", () => {
  test("each registered zoom key has the same update as its HUD action without history", () => {
    const actions = [
      ["Mod+=", Message.RequestedZoomIn()],
      ["Mod+Plus", Message.RequestedZoomIn()],
      ["Mod+Shift+Plus", Message.RequestedZoomIn()],
      ["Mod+-", Message.RequestedZoomOut()],
      ["Mod+0", Message.RequestedResetView()],
      ["Shift+1", Message.RequestedFitToScreen()],
      ["Shift+!", Message.RequestedFitToScreen()],
    ] as const;
    const initial: Model = {
      ...baseModel,
      history: Option.getOrThrow(
        History.undo(History.commit(baseModel.history, (doc) => Doc.renameDocument(doc, "Next"))),
      ),
    };
    for (const [keys, hud] of actions) {
      const binding = bindingsFor("Normal").find((entry) => entry.keys === keys)!;
      const result = update(initial, binding.mapEvent(new KeyboardEvent("keydown")));
      expect(result).toEqual(update(initial, hud));
      expect(result.model.history.past).toEqual(initial.history.past);
      expect(result.model.history.future).toEqual(initial.history.future);
      expect(isDirty(result.model)).toBe(false);
    }
  });

  test("zoom and reset keep the world point under the viewport center fixed", () => {
    const initial = {
      ...baseModel,
      history: History.init(
        Doc.setViewport(Doc.sampleDocument, { pan: { x: -90, y: 120 }, zoom: 0.5 }),
      ),
    };
    const center = { x: 600, y: 400 };
    const before = Geometry.screenToWorld(initial.history.present.layout.viewport, center);
    for (const action of [
      Message.RequestedZoomIn(),
      Message.RequestedZoomOut(),
      Message.RequestedResetView(),
    ]) {
      const after = update(initial, action).model.history.present.layout.viewport;
      expect(Geometry.screenToWorld(after, center)).toEqual(before);
    }
  });

  test.each([
    Selection.SelectedEntity({ entityId: "e2", row: CardRow.Title() }),
    Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
    Selection.SelectedAssociation({ associationId: "r1" }),
  ])("zoom to $_tag centers the selected cards with shared padding", (selection) => {
    const initial = { ...baseModel, selection };
    const nodeIds =
      selection._tag === "SelectedEntity"
        ? ["e2"]
        : selection._tag === "SelectedEnum"
          ? ["t1"]
          : ["e1", "e2"];
    const document = baseModel.history.present;
    const rects = Geometry.cardRects({
      ...document,
      entities: document.entities.filter((entity) => nodeIds.includes(entity.id)),
      types: document.types.filter((definition) => nodeIds.includes(definition.id)),
    });
    const bounds = Option.getOrThrow(Geometry.boundingRect(rects));
    const result = update(initial, Message.PressedZoomToSelectionKey()).model;
    const viewport = result.history.present.layout.viewport;
    expect(viewport).toEqual(Geometry.fitViewport(bounds, initial.screen, Geometry.MAX_ZOOM));
    const center = Geometry.worldToScreen(viewport, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    });
    expect(center.x).toBeCloseTo(initial.screen.width / 2);
    expect(center.y).toBeCloseTo(initial.screen.height / 2);
    expect(viewport.zoom).toBeLessThanOrEqual(Geometry.MAX_ZOOM);
    expect(result.selection).toEqual(selection);
    expect(result.editor).toEqual(initial.editor);
    expect(result.history.past).toEqual(initial.history.past);
    expect(result.history.future).toEqual(initial.history.future);
    expect(isDirty(result)).toBe(false);
  });

  test("zoom to a small collapsed card stops at max zoom", () => {
    const result = update(
      {
        ...baseModel,
        screen: { width: 4000, height: 3000 },
        selection: Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
      },
      Message.PressedZoomToSelectionKey(),
    ).model;
    expect(result.history.present.layout.viewport.zoom).toBe(Geometry.MAX_ZOOM);
  });

  test.each([
    Selection.NoSelection(),
    Selection.SelectedEntity({ entityId: "missing", row: CardRow.Title() }),
    Selection.SelectedEnum({ typeId: "missing", row: CardRow.Title() }),
    Selection.SelectedAssociation({ associationId: "missing" }),
  ])("no selectable cards leaves the entire model unchanged", (selection) => {
    const initial = { ...baseModel, selection };
    expect(update(initial, Message.PressedZoomToSelectionKey()).model).toBe(initial);
  });

  test("fit-all includes enum cards and retains the HUD's 100% cap and empty reset", () => {
    const result = update(baseModel, Message.RequestedFitToScreen()).model;
    const bounds = Option.getOrThrow(Geometry.documentBounds(Doc.sampleDocument));
    expect(result.history.present.layout.viewport).toEqual(
      Geometry.fitViewport(bounds, baseModel.screen),
    );
    const empty = {
      ...baseModel,
      history: History.init(
        Doc.setViewport(Doc.emptyDocument("Empty"), { pan: { x: 30, y: 40 }, zoom: 2 }),
      ),
    };
    expect(
      update(empty, Message.RequestedFitToScreen()).model.history.present.layout.viewport,
    ).toEqual(Doc.DEFAULT_VIEWPORT);
  });
});

describe("new chooser", () => {
  const chosen = (m: Model) => (m.editor._tag === "ChoosingNew" ? m.editor.highlighted : undefined);

  test("c opens the chooser at the viewport center with Entity highlighted", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.ChoosingNew({ position: { x: 500, y: 378 }, highlighted: "Entity" }),
        );
        expect(m.history).toBe(baseModel.history);
      }),
    );
  });

  test("c closes the relationship inspector and uses the transformed viewport center", () => {
    const inspecting: Model = {
      ...baseModel,
      editor: EditorState.EditingAssociation({ associationId: "r1" }),
      history: History.init(
        Doc.setViewport(Doc.sampleDocument, { pan: { x: 100, y: -40 }, zoom: 2 }),
      ),
    };
    const opened = update(inspecting, Message.PressedNewKey()).model;
    expect(opened.editor).toEqual(
      EditorState.ChoosingNew({ position: { x: 150, y: 198 }, highlighted: "Entity" }),
    );
    expect(opened.history).toBe(inspecting.history);
  });

  test("arrow keys move the highlight and wrap", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      message(Message.MovedChooserHighlight({ direction: "Down" })),
      model((m) => expect(chosen(m)).toBe("Enum")),
      message(Message.MovedChooserHighlight({ direction: "Down" })),
      model((m) => expect(chosen(m)).toBe("Entity")),
      message(Message.MovedChooserHighlight({ direction: "Up" })),
      model((m) => expect(chosen(m)).toBe("Enum")),
    );
  });

  test("picking Entity starts creating an entity at the stored position", () => {
    const position = { x: 23, y: 47 };
    const opened = {
      ...baseModel,
      editor: EditorState.ChoosingNew({ position, highlighted: "Entity" }),
    };
    story(
      update,
      given(opened),
      message(Message.PickedNew({ kind: "Entity" })),
      Command.expectExact(FocusInput),
      focused,
      model((m) =>
        expect(m.editor).toEqual(EditorState.CreatingEntity({ position, draftName: "" })),
      ),
    );
  });

  test("Enter picks the highlighted option, so Enum after ArrowDown", () => {
    const position = { x: -75, y: 125 };
    const opened = {
      ...baseModel,
      editor: EditorState.ChoosingNew({ position, highlighted: "Entity" }),
    };
    story(
      update,
      given(opened),
      message(Message.MovedChooserHighlight({ direction: "Down" })),
      message(Message.PressedEnterKey()),
      focused,
      model((m) => expect(m.editor).toEqual(EditorState.CreatingEnum({ position, draftName: "" }))),
    );
  });

  test("picking Enum starts creating an enum at the stored position", () => {
    const position = { x: 31, y: -58 };
    story(
      update,
      given({
        ...baseModel,
        editor: EditorState.ChoosingNew({ position, highlighted: "Entity" }),
      }),
      message(Message.PickedNew({ kind: "Enum" })),
      Command.expectExact(FocusInput),
      focused,
      model((m) => expect(m.editor).toEqual(EditorState.CreatingEnum({ position, draftName: "" }))),
    );
  });

  test("Escape returns to Idle without touching the document or history", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history.present).toBe(baseModel.history.present);
        expect(m.history.past).toHaveLength(0);
        expect(isDirty(m)).toBe(false);
      }),
    );
  });

  test("clicking outside the chooser cancels it", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      message(Message.ClickedCancelEdit()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history).toBe(baseModel.history);
      }),
    );
  });

  test("the New Document key behaves like the New model button, including during a draft", () => {
    for (const editor of [
      EditorState.Idle(),
      EditorState.ChoosingNew({ position: { x: 0, y: 0 }, highlighted: "Enum" }),
      EditorState.CreatingEntity({ position: { x: 0, y: 0 }, draftName: "Unsaved" }),
    ]) {
      const current = { ...baseModel, editor };
      const viaKey = update(current, Message.RequestedNewDocument());
      const viaButton = update(current, Message.RequestedNewDocument());
      expect(viaKey.model).toEqual(viaButton.model);
      expect(viaKey.commands).toEqual(viaButton.commands);
      expect(viaKey.model.maybeFilePath).toEqual(Option.none());
      expect(viaKey.model.editor).toEqual(EditorState.Idle());
      expect(viaKey.model.history.present.entities).toHaveLength(0);
      expect(viaKey.model.history.present.types).toHaveLength(0);
      expect(viaKey.model.history.present.name).toBe("Untitled");
    }
  });
});

describe("key bindings", () => {
  const dispatched = (mode: Parameters<typeof bindingsFor>[0], keys: string) =>
    bindingsFor(mode)
      .filter((binding) => binding.keys === keys)
      .map((binding) => binding.mapEvent(new KeyboardEvent("keydown"))._tag);

  test("c in Normal mode opens the chooser", () => {
    expect(toKeyMode(EditorState.Idle())).toBe("Normal");
    expect(toKeyMode(EditorState.EditingAssociation({ associationId: "a1" }))).toBe("Normal");
    expect(dispatched("Normal", "C")).toEqual(["PressedNewKey"]);
  });

  test("Text mode has no creation binding, so c types normally", () => {
    expect(toKeyMode(EditorState.CreatingEntity({ position: { x: 0, y: 0 }, draftName: "" }))).toBe(
      "Text",
    );
    expect(dispatched("Text", "C")).toEqual([]);
    expect(
      bindingsFor("Text").some(
        (binding) => binding.mapEvent(new KeyboardEvent("keydown"))._tag === "PressedNewKey",
      ),
    ).toBe(false);
  });

  test("Mod+N is New Document in every file-capable mode, including while typing", () => {
    for (const mode of ["Normal", "Text", "Choosing"] as const) {
      const binding = bindingsFor(mode).find((candidate) => candidate.keys === "Mod+N");
      expect(binding?.whileTyping).toBe("Allow");
      expect(binding?.mapEvent(new KeyboardEvent("keydown"))._tag).toBe("RequestedNewDocument");
    }
  });

  test("the chooser keys", () => {
    expect(
      toKeyMode(EditorState.ChoosingNew({ position: { x: 0, y: 0 }, highlighted: "Entity" })),
    ).toBe("Choosing");
    expect(dispatched("Choosing", "ArrowDown")).toEqual(["MovedChooserHighlight"]);
    expect(dispatched("Choosing", "ArrowUp")).toEqual(["MovedChooserHighlight"]);
    expect(dispatched("Choosing", "1")).toEqual(["PickedNew"]);
    expect(dispatched("Choosing", "2")).toEqual(["PickedNew"]);
    expect(dispatched("Choosing", "Enter")).toEqual(["PressedEnterKey"]);
    expect(dispatched("Choosing", "Escape")).toEqual(["PressedEscapeKey"]);
    expect(dispatched("Choosing", "C")).toEqual([]);
  });
});

describe("keyboard shortcuts overlay", () => {
  const selected: Model = {
    ...baseModel,
    selection: Selection.SelectedEntity({ entityId: "e1", row: CardRow.Title() }),
  };

  test("question mark opens Help; Escape closes without changing selection, document or history", () => {
    story(
      update,
      given(selected),
      message(Message.PressedShortcutsKey()),
      focused,
      model((m) => {
        expect(m.editor).toEqual(EditorState.ViewingShortcuts());
        expect(toKeyMode(m.editor)).toBe("Help");
        expect(m.history).toBe(selected.history);
        expect(m.selection).toEqual(selected.selection);
        expect(isDirty(m)).toBe(false);
      }),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.history).toBe(selected.history);
        expect(m.selection).toEqual(selected.selection);
      }),
    );
  });

  test("toolbar opens help; question mark, outside click and close button cancel it", () => {
    for (const close of [Message.PressedShortcutsKey(), Message.ClickedCancelEdit()]) {
      story(
        update,
        given(selected),
        message(Message.ClickedShowShortcuts()),
        focused,
        model((m) => expect(m.editor).toEqual(EditorState.ViewingShortcuts())),
        message(close),
        model((m) => {
          expect(m.editor).toEqual(EditorState.Idle());
          expect(m.selection).toEqual(selected.selection);
          expect(m.history).toBe(selected.history);
        }),
      );
    }
  });

  test("opening from the inspector keeps its selected relationship", () => {
    const inspecting: Model = {
      ...baseModel,
      selection: Selection.SelectedAssociation({ associationId: "r1" }),
      editor: EditorState.EditingAssociation({ associationId: "r1" }),
    };
    story(
      update,
      given(inspecting),
      message(Message.PressedShortcutsKey()),
      focused,
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(m.selection).toEqual(inspecting.selection);
        expect(m.history).toBe(inspecting.history);
      }),
    );
  });

  test("toolbar help does not commit an unfinished draft or leave Space held", () => {
    const drafting: Model = {
      ...selected,
      panKey: "Held",
      editor: EditorState.RenamingEntity({ entityId: "e1", draftName: "Uncommitted" }),
    };
    story(
      update,
      given(drafting),
      message(Message.ClickedShowShortcuts()),
      focused,
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history).toBe(selected.history);
        expect(m.selection).toEqual(selected.selection);
        expect(m.panKey).toBe("Released");
      }),
    );
  });
});

describe("entities", () => {
  test("c, typing, and Enter create a selected entity", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      message(Message.PressedEnterKey()),
      focused,
      model((m) => expect(m.editor._tag).toBe("CreatingEntity")),
      message(Message.UpdatedEntityDraftName({ name: "  Comment " })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        const created = lastEntity(m);
        expect(created.name).toBe("Comment");
        expect(m.history.present.entities).toHaveLength(4);
        expect(m.selection).toEqual(
          Selection.SelectedEntity({ entityId: created.id, row: CardRow.Title() }),
        );
        expect(m.history.present.layout.nodes[created.id]).toBeDefined();
      }),
    );
  });

  test("Escape while creating discards the draft", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedNewKey()),
      message(Message.PickedNew({ kind: "Entity" })),
      focused,
      message(Message.UpdatedEntityDraftName({ name: "Comment" })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(3);
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });

  test("Enter on a selected entity expands it and starts renaming", () => {
    story(
      update,
      given({
        ...baseModel,
        selection: Selection.SelectedEntity({ entityId: "e3", row: CardRow.Title() }),
      }),
      message(Message.PressedEnterKey()),
      focused,
      model((m) => {
        expect(m.editor).toEqual(EditorState.RenamingEntity({ entityId: "e3", draftName: "Tag" }));
        expect(m.history.present.layout.nodes["e3"]?.isExpanded).toBe(true);
      }),
      message(Message.UpdatedEntityDraftName({ name: "Label" })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(Option.getOrThrow(Doc.findEntity(m.history.present, "e3")).name).toBe("Label");
        expect(m.history.past).toHaveLength(1);
      }),
    );
  });

  test("pressing the canvas commits an in-progress rename", () => {
    story(
      update,
      given({
        ...baseModel,
        editor: EditorState.RenamingEntity({ entityId: "e3", draftName: "Label" }),
      }),
      message(Message.PressedCanvas(press)),
      model((m) =>
        expect(Option.getOrThrow(Doc.findEntity(m.history.present, "e3")).name).toBe("Label"),
      ),
    );
  });

  test("delete removes the entity with its edges, and undo restores both", () => {
    story(
      update,
      given({
        ...baseModel,
        selection: Selection.SelectedEntity({ entityId: "e2", row: CardRow.Title() }),
      }),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(2);
        expect(m.history.present.associations).toHaveLength(0);
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.RequestedUndo()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(3);
        expect(m.history.present.associations).toHaveLength(2);
      }),
      message(Message.RequestedRedo()),
      model((m) => expect(m.history.present.entities).toHaveLength(2)),
    );
  });
});

describe("attributes", () => {
  test("adding a field opens it for editing and saving applies the draft", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddAttribute({ entityId: "e3" })),
      focused,
      model((m) => {
        expect(m.editor._tag).toBe("EditingAttribute");
        expect(m.history.present.layout.nodes["e3"]?.isExpanded).toBe(true);
      }),
      message(Message.UpdatedAttributeDraftName({ name: "kind" })),
      message(Message.SelectedAttributeDraftType({ type: "Integer" })),
      message(Message.SelectedAttributeDraftMultiplicity({ multiplicity: { min: 0, max: "one" } })),
      message(Message.ToggledAttributeDraftUnique()),
      message(Message.PressedEnterKey()),
      model((m) => {
        const tag = Option.getOrThrow(Doc.findEntity(m.history.present, "e3"));
        expect(tag.attributes).toHaveLength(2);
        expect(tag.attributes.at(-1)).toEqual({
          id: tag.attributes.at(-1)?.id,
          name: "kind",
          type: "Integer",
          multiplicity: { min: 0, max: "one" },
          unique: true,
        });
        // One snapshot for adding the field, one for saving the edit.
        expect(m.history.past).toHaveLength(2);
      }),
    );
  });

  test("choosing a list multiplicity clears unique", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditAttribute({ entityId: "e1", attributeId: "p2" })),
      focused,
      model((m) => expect(m.editor).toMatchObject({ draft: { unique: true } })),
      message(
        Message.SelectedAttributeDraftMultiplicity({ multiplicity: { min: 0, max: "many" } }),
      ),
      model((m) =>
        expect(m.editor).toMatchObject({
          draft: { multiplicity: { min: 0, max: "many" }, unique: false },
        }),
      ),
      // Unique stays off while the multiplicity is a list.
      message(Message.ToggledAttributeDraftUnique()),
      model((m) => expect(m.editor).toMatchObject({ draft: { unique: false } })),
      message(Message.PressedEnterKey()),
      model((m) => {
        const user = Option.getOrThrow(Doc.findEntity(m.history.present, "e1"));
        expect(Option.getOrThrow(Doc.findAttribute(user, "p2"))).toMatchObject({
          multiplicity: { min: 0, max: "many" },
          unique: false,
        });
      }),
    );
  });

  test("cancelling an edit leaves the field unchanged", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditAttribute({ entityId: "e1", attributeId: "p2" })),
      focused,
      message(Message.UpdatedAttributeDraftName({ name: "mail" })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history.present).toEqual(baseModel.history.present);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });
});

describe("associations", () => {
  test("dropping a port drag on another entity creates an edge and opens the inspector", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedPort({ entityId: "e3", ...press, clientX: 1180, clientY: 162 })),
      model((m) => expect(m.editor._tag).toBe("ConnectingAssociation")),
      message(Message.MovedPointer({ clientX: 300, clientY: 160 })),
      message(
        Message.ReleasedPointer({
          clientX: 300,
          clientY: 160,
          maybeTargetEntityId: Option.some("e1"),
        }),
      ),
      model((m) => {
        const { id: associationId } = lastAssociation(m);
        expect(m.history.present.associations).toHaveLength(3);
        expect(m.editor).toEqual(EditorState.EditingAssociation({ associationId }));
        expect(Option.getOrThrow(Doc.findAssociation(m.history.present, associationId))).toEqual({
          id: associationId,
          ends: [
            { entityId: "e3", multiplicity: { min: 1, max: "one" } },
            { entityId: "e1", multiplicity: { min: 0, max: "many" } },
          ],
        });
        // The saved file links the two entities and nothing else: no field keys.
        const json = Schema.encodeSync(DomainModelDocumentJsonString)(m.history.present);
        const saved = JSON.parse(json).associations.at(-1);
        expect(Object.keys(saved).sort()).toEqual(["ends", "id"]);
      }),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.associations).toHaveLength(2);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });

  test("choosing a multiplicity and typing a role are undoable edits", () => {
    const inspected = {
      ...baseModel,
      editor: EditorState.EditingAssociation({ associationId: "r1" }),
      selection: Selection.SelectedAssociation({ associationId: "r1" }),
    };
    const r1Ends = (m: Model) =>
      Option.getOrThrow(Doc.findAssociation(m.history.present, "r1")).ends;
    story(
      update,
      given(inspected),
      message(
        Message.SelectedEndMultiplicity({
          associationId: "r1",
          endIndex: 0,
          multiplicity: { min: 0, max: "one" },
        }),
      ),
      message(Message.ChangedEndRole({ associationId: "r1", endIndex: 1, role: "articles" })),
      model((m) => {
        expect(r1Ends(m)[0].multiplicity).toEqual({ min: 0, max: "one" });
        expect(r1Ends(m)[1].role).toBe("articles");
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.PressedEscapeKey()),
      message(Message.RequestedUndo()),
      model((m) => expect(r1Ends(m)[1].role).toBeUndefined()),
      message(Message.RequestedUndo()),
      model((m) => expect(r1Ends(m)[0].multiplicity).toEqual({ min: 1, max: "one" })),
      message(Message.RequestedRedo()),
      model((m) => expect(r1Ends(m)[0].multiplicity).toEqual({ min: 0, max: "one" })),
    );
  });

  test("releasing on empty canvas cancels the connection", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedPort({ entityId: "e3", ...press })),
      message(
        Message.ReleasedPointer({ clientX: 500, clientY: 700, maybeTargetEntityId: Option.none() }),
      ),
      model((m) => {
        expect(m.history.present.associations).toHaveLength(2);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });

  test("a tap on a port does not create an accidental self reference", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedPort({ entityId: "e3", ...press })),
      message(
        Message.ReleasedPointer({ clientX: 2, clientY: 2, maybeTargetEntityId: Option.some("e3") }),
      ),
      model((m) => expect(m.history.present.associations).toHaveLength(2)),
    );
  });
});

describe("enums", () => {
  const findRole = (m: Model) => Option.getOrThrow(Doc.findEnum(m.history.present, "t1"));
  const roleValues = (m: Model) => findRole(m).values.map((value) => value.name);

  test("+ Enum, typing, and Enter create a selected enum; undo removes it", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddEnum()),
      focused,
      model((m) => expect(m.editor._tag).toBe("CreatingEnum")),
      message(Message.UpdatedEnumDraftName({ name: " Status " })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        const created = lastEnum(m);
        expect(created.name).toBe("Status");
        expect(m.history.present.types).toHaveLength(2);
        expect(m.selection).toEqual(
          Selection.SelectedEnum({ typeId: created.id, row: CardRow.Title() }),
        );
        expect(m.history.present.layout.nodes[created.id]).toBeDefined();
      }),
      message(Message.RequestedUndo()),
      model((m) => {
        expect(m.history.present.types).toHaveLength(1);
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
    );
  });

  test("Escape while creating an enum discards the draft", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddEnum()),
      focused,
      message(Message.UpdatedEnumDraftName({ name: "Status" })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history.present.types).toHaveLength(1);
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });

  test("double-clicking the name renames the enum, and undo restores it", () => {
    story(
      update,
      given(baseModel),
      message(Message.DoubleClickedEnumName({ typeId: "t1" })),
      focused,
      model((m) =>
        expect(m.editor).toEqual(EditorState.RenamingEnum({ typeId: "t1", draftName: "Role" })),
      ),
      message(Message.UpdatedEnumDraftName({ name: "Permission" })),
      message(Message.PressedEnterKey()),
      model((m) => expect(findRole(m).name).toBe("Permission")),
      message(Message.RequestedUndo()),
      model((m) => expect(findRole(m).name).toBe("Role")),
    );
  });

  test("Enter on a selected enum expands it and starts renaming", () => {
    story(
      update,
      given({
        ...baseModel,
        selection: Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
      }),
      message(Message.PressedEnterKey()),
      focused,
      model((m) => {
        expect(m.editor).toEqual(EditorState.RenamingEnum({ typeId: "t1", draftName: "Role" }));
        expect(m.history.present.layout.nodes["t1"]?.isExpanded).toBe(true);
      }),
    );
  });

  test("adding a value opens it for editing and saving applies the draft", () => {
    let valueId = "";
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddEnumValue({ typeId: "t1" })),
      focused,
      model((m) => {
        valueId = findRole(m).values.at(-1)!.id;
        expect(roleValues(m)).toEqual(["reader", "author", "admin", "value4"]);
        expect(m.editor).toEqual(
          EditorState.EditingEnumValue({
            typeId: "t1",
            valueId,
            draft: { name: "value4", description: "" },
            save: "Commit",
          }),
        );
        expect(m.history.present.layout.nodes["t1"]?.isExpanded).toBe(true);
      }),
      message(Message.UpdatedEnumValueDraftName({ name: " guest " })),
      message(Message.UpdatedEnumValueDraftDescription({ description: "Not signed in" })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(findRole(m).values.at(-1)).toEqual({
          id: valueId,
          name: "guest",
          description: "Not signed in",
        });
        // One snapshot for adding the value, one for saving the edit.
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.RequestedUndo()),
      model((m) => expect(findRole(m).values.at(-1)).toEqual({ id: valueId, name: "value4" })),
      message(Message.RequestedUndo()),
      model((m) => expect(roleValues(m)).toEqual(["reader", "author", "admin"])),
    );
  });

  test("editing a value is undoable, and cancelling leaves it unchanged", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditEnumValue({ typeId: "t1", valueId: "v1" })),
      focused,
      message(Message.UpdatedEnumValueDraftName({ name: "viewer" })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history.present).toEqual(Doc.setExpanded(baseModel.history.present, "t1", true));
        expect(m.editor).toEqual(EditorState.Idle());
      }),
      message(Message.ClickedEditEnumValue({ typeId: "t1", valueId: "v1" })),
      focused,
      message(Message.UpdatedEnumValueDraftName({ name: "viewer" })),
      message(Message.ClickedSaveEnumValue()),
      model((m) => expect(roleValues(m)).toEqual(["viewer", "author", "admin"])),
      message(Message.RequestedUndo()),
      model((m) => expect(roleValues(m)).toEqual(["reader", "author", "admin"])),
    );
  });

  test("moving and deleting a value are undoable", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedMoveEnumValue({ typeId: "t1", valueId: "v3", direction: "Up" })),
      model((m) => expect(roleValues(m)).toEqual(["reader", "admin", "author"])),
      message(Message.ClickedDeleteEnumValue({ typeId: "t1", valueId: "v1" })),
      model((m) => expect(roleValues(m)).toEqual(["admin", "author"])),
      message(Message.RequestedUndo()),
      model((m) => expect(roleValues(m)).toEqual(["reader", "admin", "author"])),
      message(Message.RequestedUndo()),
      model((m) => expect(roleValues(m)).toEqual(["reader", "author", "admin"])),
    );
  });

  test("deleting the value being edited returns to Idle", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditEnumValue({ typeId: "t1", valueId: "v2" })),
      focused,
      message(Message.ClickedDeleteEnumValue({ typeId: "t1", valueId: "v2" })),
      model((m) => {
        expect(roleValues(m)).toEqual(["reader", "admin"]);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });

  test("d deletes the selected enum and its node; undo and redo", () => {
    story(
      update,
      given({
        ...baseModel,
        selection: Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }),
      }),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.types).toHaveLength(0);
        expect(m.history.present.layout.nodes["t1"]).toBeUndefined();
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.RequestedUndo()),
      model((m) => {
        expect(findRole(m).name).toBe("Role");
        expect(m.history.present.layout.nodes["t1"]).toBeDefined();
      }),
      message(Message.RequestedRedo()),
      model((m) => expect(m.history.present.types).toHaveLength(0)),
    );
  });

  test("the Delete <Name> button deletes the enum", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedDeleteEnum({ typeId: "t1" })),
      model((m) => expect(m.history.present.types).toHaveLength(0)),
    );
  });

  test("dragging an enum card moves it in one undoable step", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedEnumHeader({ typeId: "t1", ...press, clientX: 150, clientY: 540 })),
      model((m) => {
        expect(m.editor._tag).toBe("DraggingNode");
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }));
      }),
      message(Message.MovedPointer({ clientX: 250, clientY: 600 })),
      message(
        Message.ReleasedPointer({
          clientX: 250,
          clientY: 600,
          maybeTargetEntityId: Option.none(),
        }),
      ),
      model((m) => {
        expect(m.history.present.layout.nodes["t1"]?.position).toEqual({ x: 220, y: 580 });
        expect(m.history.past).toHaveLength(1);
      }),
      message(Message.RequestedUndo()),
      model((m) =>
        expect(m.history.present.layout.nodes["t1"]?.position).toEqual({ x: 120, y: 520 }),
      ),
    );
  });

  test("a connection released on an enum card creates nothing", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedPort({ entityId: "e1", ...press, clientX: 420, clientY: 162 })),
      message(Message.MovedPointer({ clientX: 150, clientY: 540 })),
      message(
        Message.ReleasedPointer({
          clientX: 150,
          clientY: 540,
          maybeTargetEntityId: Option.some("t1"),
        }),
      ),
      model((m) => {
        expect(m.history.present.associations).toHaveLength(2);
        expect(m.history.past).toHaveLength(0);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });
});

describe("enum-typed fields", () => {
  const post = (m: Model) => Option.getOrThrow(Doc.findEntity(m.history.present, "e2"));

  test("New enum… is one undo step that types the field and opens the first value", () => {
    let typeId = "";
    let valueId = "";
    let attributeId = "";
    const status = (m: Model) => Option.getOrThrow(Doc.findEnum(m.history.present, typeId));
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddAttribute({ entityId: "e2" })),
      focused,
      message(Message.UpdatedAttributeDraftName({ name: "status" })),
      message(Message.SelectedAttributeDraftNewEnum()),
      focused,
      model((m) => {
        typeId = lastEnum(m).id;
        valueId = lastEnum(m).values[0]!.id;
        attributeId = post(m).attributes.at(-1)!.id;
        expect(new Set([typeId, valueId, attributeId]).size).toBe(3);
        expect(m.editor).toEqual(
          EditorState.EditingEnumValue({
            typeId,
            valueId,
            draft: { name: "", description: "" },
            save: "Amend",
          }),
        );
        expect(m.selection).toEqual(
          Selection.SelectedEnum({ typeId, row: CardRow.Value({ valueId }) }),
        );
        expect(post(m).attributes.at(-1)).toMatchObject({ name: "status", type: { typeId } });
        expect(status(m).name).toBe("Status");
        expect(m.history.present.layout.nodes[typeId]?.isExpanded).toBe(true);
        // One snapshot for adding the field, one for the whole "New enum…".
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.UpdatedEnumValueDraftName({ name: "draft" })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(status(m).values).toEqual([{ id: valueId, name: "draft" }]);
        // Naming the first value folds into the same step.
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.RequestedUndo()),
      model((m) => {
        expect(Doc.findEnum(m.history.present, typeId)).toEqual(Option.none());
        expect(m.history.present.layout.nodes[typeId]).toBeUndefined();
        expect(post(m).attributes.at(-1)).toEqual(Doc.newAttribute(attributeId, "field3"));
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.RequestedRedo()),
      model((m) => {
        expect(status(m).values).toEqual([{ id: valueId, name: "draft" }]);
        expect(post(m).attributes.at(-1)?.type).toEqual({ typeId });
      }),
    );
  });

  test("New enum… with a blank field name makes NewEnum", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditAttribute({ entityId: "e2", attributeId: "p7" })),
      focused,
      message(Message.UpdatedAttributeDraftName({ name: " " })),
      message(Message.SelectedAttributeDraftNewEnum()),
      focused,
      model((m) => {
        const created = lastEnum(m);
        expect(created.name).toBe("NewEnum");
        // A blank draft name keeps the field's own name.
        expect(post(m).attributes[0]).toMatchObject({
          name: "title",
          type: { typeId: created.id },
        });
      }),
    );
  });

  test("choosing an existing enum types the field by reference", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditAttribute({ entityId: "e2", attributeId: "p7" })),
      focused,
      message(Message.SelectedAttributeDraftType({ type: { typeId: "t1" } })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(post(m).attributes[0]?.type).toEqual({ typeId: "t1" });
        expect(m.history.past).toHaveLength(1);
      }),
    );
  });

  test("going to a field's enum selects it without moving the camera", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedGoToEnum({ typeId: "t1" })),
      model((m) => {
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t1", row: CardRow.Title() }));
        expect(m.history.present.layout.viewport).toEqual(
          baseModel.history.present.layout.viewport,
        );
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });
});

describe("keyboard row verbs", () => {
  const fields = (m: Model) =>
    Option.getOrThrow(Doc.findEntity(m.history.present, "e1")).attributes;
  const values = (m: Model) => Option.getOrThrow(Doc.findEnum(m.history.present, "t1")).values;
  const entityCursor = (row: CardRow): Selection =>
    Selection.SelectedEntity({ entityId: "e1", row });
  const enumCursor = (row: CardRow): Selection => Selection.SelectedEnum({ typeId: "t1", row });

  for (const kind of ["Entity", "Enum"] as const) {
    const rows = kind === "Entity" ? fields : values;
    const select = kind === "Entity" ? entityCursor : enumCursor;
    const row = (id: string) =>
      kind === "Entity" ? CardRow.Attribute({ attributeId: id }) : CardRow.Value({ valueId: id });
    const ids = kind === "Entity" ? ["p2", "p3", "p4"] : ["v1", "v2", "v3"];
    // The inserted row's ID is random: it's the one the sample didn't have.
    const addedId = (m: Model) => rows(m).find(({ id }) => !ids.includes(id))!.id;
    const nodeId = kind === "Entity" ? "e1" : "t1";
    const defaultName = kind === "Entity" ? "field4" : "value4";

    for (const position of ["Above", "Below"] as const) {
      for (const onTitle of [false, true]) {
        test(`${kind}: ${position} inserts ${onTitle ? "first on Title" : "next to the first row"} and focuses its editor`, () => {
          const selected = {
            ...baseModel,
            selection: select(onTitle ? CardRow.Title() : row(ids[0]!)),
          };
          const result = update(selected, Message.InsertedCardRow({ position }));
          const m = result.model;
          const index = onTitle || position === "Above" ? 0 : 1;
          const newId = addedId(m);
          expect(rows(m).map(({ id }) => id)).toEqual([
            ...ids.slice(0, index),
            newId,
            ...ids.slice(index),
          ]);
          expect(rows(m)[index]).toEqual(
            kind === "Entity"
              ? Doc.newAttribute(newId, defaultName)
              : { id: newId, name: defaultName },
          );
          expect(m.selection).toEqual(select(row(newId)));
          expect(m.editor).toMatchObject(
            kind === "Entity"
              ? {
                  _tag: "EditingAttribute",
                  entityId: nodeId,
                  attributeId: newId,
                  draft: { name: defaultName },
                }
              : {
                  _tag: "EditingEnumValue",
                  typeId: nodeId,
                  valueId: newId,
                  draft: { name: defaultName },
                  save: "Commit",
                },
          );
          expect(m.history.present.layout.nodes[nodeId]?.isExpanded).toBe(true);
          expect(m.history.past).toHaveLength(1);
          story(
            update,
            given(selected),
            message(Message.InsertedCardRow({ position })),
            Command.expectHas(FocusInput),
            focused,
          );
        });
      }
    }

    test(`${kind}: insertion explicitly expands a collapsed card without losing its cursor position`, () => {
      const selected = {
        ...baseModel,
        history: History.init(Doc.setExpanded(Doc.sampleDocument, nodeId, false)),
        selection: select(row(ids[1]!)),
      };
      const m = update(selected, Message.InsertedCardRow({ position: "Below" })).model;
      expect(rows(m).map(({ id }) => id)).toEqual([ids[0], ids[1], addedId(m), ids[2]]);
      expect(m.history.present.layout.nodes[nodeId]?.isExpanded).toBe(true);
      expect(m.selection).toEqual(select(row(addedId(m))));
      expect(m.history.past).toHaveLength(1);
    });

    test(`${kind}: both insertions work on an empty card`, () => {
      const document = ids.reduce(
        (document, id) =>
          kind === "Entity"
            ? Doc.deleteAttribute(document, nodeId, id)
            : Doc.deleteEnumValue(document, nodeId, id),
        Doc.sampleDocument,
      );
      for (const position of ["Above", "Below"] as const) {
        const m = update(
          { ...baseModel, history: History.init(document), selection: select(CardRow.Title()) },
          Message.InsertedCardRow({ position }),
        ).model;
        expect(rows(m)).toHaveLength(1);
        expect(rows(m)[0]?.name).toBe(kind === "Entity" ? "field1" : "value1");
        expect(m.history.present.layout.nodes[nodeId]?.isExpanded).toBe(true);
      }
    });

    test(`${kind}: Escape keeps the inserted default row just like the footer action`, () => {
      const selected = { ...baseModel, selection: select(CardRow.Title()) };
      let inserted = update(selected, Message.InsertedCardRow({ position: "Below" })).model;
      inserted = update(
        inserted,
        kind === "Entity"
          ? Message.UpdatedAttributeDraftName({ name: "" })
          : Message.UpdatedEnumValueDraftName({ name: "" }),
      ).model;
      const cancelled = update(inserted, Message.PressedEscapeKey()).model;
      expect(rows(cancelled)[0]?.name).toBe(defaultName);
      expect(cancelled.editor).toEqual(EditorState.Idle());
      expect(cancelled.selection).toEqual(select(row(addedId(cancelled))));
      expect(cancelled.history).toBe(inserted.history);

      const footer = update(
        baseModel,
        kind === "Entity"
          ? Message.ClickedAddAttribute({ entityId: nodeId })
          : Message.ClickedAddEnumValue({ typeId: nodeId }),
      ).model;
      const cancelledFooter = update(footer, Message.PressedEscapeKey()).model;
      expect(rows(cancelledFooter).at(-1)).toEqual(rows(cancelled)[0]);

      const undone = update(cancelled, Message.RequestedUndo()).model;
      expect(rows(undone).map(({ id }) => id)).toEqual(ids);
      expect(undone.selection).toEqual(select(CardRow.Title()));
    });

    test(`${kind}: commit keeps the new row current and preserves the existing two-step history`, () => {
      let m = update(
        { ...baseModel, selection: select(CardRow.Title()) },
        Message.InsertedCardRow({ position: "Above" }),
      ).model;
      m = update(
        m,
        kind === "Entity"
          ? Message.UpdatedAttributeDraftName({ name: "nickname" })
          : Message.UpdatedEnumValueDraftName({ name: "nickname" }),
      ).model;
      m = update(m, Message.PressedEnterKey()).model;
      expect(rows(m)[0]?.name).toBe("nickname");
      expect(m.editor).toEqual(EditorState.Idle());
      expect(m.selection).toEqual(select(row(addedId(m))));
      expect(m.history.past).toHaveLength(2);
      m = update(m, Message.RequestedUndo()).model;
      expect(rows(m)[0]?.name).toBe(defaultName);
      m = update(m, Message.RequestedUndo()).model;
      expect(rows(m).map(({ id }) => id)).toEqual(ids);
    });

    test(`${kind}: J/K share the move button behavior and keep cursor identity through undo/redo`, () => {
      const selected = { ...baseModel, selection: select(row(ids[1]!)) };
      let m = selected;
      for (const direction of ["Up", "Down"] as const) {
        const moved = update(m, Message.ReorderedCardRow({ direction })).model;
        const clicked = update(
          m,
          kind === "Entity"
            ? Message.ClickedMoveAttribute({ entityId: nodeId, attributeId: ids[1]!, direction })
            : Message.ClickedMoveEnumValue({ typeId: nodeId, valueId: ids[1]!, direction }),
        ).model;
        expect(moved).toEqual(clicked);
        expect(moved.selection).toEqual(selected.selection);
        expect(moved.history.past.length).toBe(m.history.past.length + 1);
        expect(moved.history.present.layout).toEqual(m.history.present.layout);
        m = moved;
      }
      expect(rows(m).map(({ id }) => id)).toEqual(ids);
      m = update(m, Message.RequestedUndo()).model;
      expect(rows(m).map(({ id }) => id)).toEqual([ids[1], ids[0], ids[2]]);
      expect(m.selection).toEqual(selected.selection);
      m = update(m, Message.RequestedRedo()).model;
      expect(rows(m).map(({ id }) => id)).toEqual(ids);
      expect(m.selection).toEqual(selected.selection);
    });

    for (const [cursor, direction] of [
      [CardRow.Title(), "Up"],
      [CardRow.Title(), "Down"],
      [row(ids[0]!), "Up"],
      [row(ids[2]!), "Down"],
    ] as const) {
      test(`${kind}: reorder ${cursor._tag} ${direction} at a boundary leaves history and document unchanged`, () => {
        const selected = { ...baseModel, selection: select(cursor) };
        expect(update(selected, Message.ReorderedCardRow({ direction })).model).toBe(selected);
      });
    }
  }

  for (const selection of [
    Selection.NoSelection(),
    Selection.SelectedAssociation({ associationId: "r1" }),
  ]) {
    test(`row verbs do nothing with ${selection._tag}`, () => {
      const selected = { ...baseModel, selection };
      for (const action of [
        Message.InsertedCardRow({ position: "Above" }),
        Message.InsertedCardRow({ position: "Below" }),
        Message.ReorderedCardRow({ direction: "Up" }),
        Message.ReorderedCardRow({ direction: "Down" }),
      ]) {
        expect(update(selected, action)).toEqual({ model: selected });
      }
    });
  }
});

describe("files", () => {
  test("save hands the committed document to SaveFile", () => {
    story(
      update,
      given({
        ...baseModel,
        editor: EditorState.RenamingEntity({ entityId: "e3", draftName: "Label" }),
      }),
      message(Message.RequestedSave()),
      Command.expectHas(SaveFile),
      Command.resolve(
        SaveFile,
        Message.SucceededSaveFile({
          document: Doc.renameEntity(Doc.sampleDocument, "e3", "Label"),
          path: "/models/blog.domain.json",
        }),
      ),
      model((m) => {
        expect(isDirty(m)).toBe(false);
        expect(maybeFileName(m)).toEqual(Option.some("blog.domain.json"));
        expect(Option.getOrThrow(Doc.findEntity(m.history.present, "e3")).name).toBe("Label");
      }),
    );
  });

  test("an opened file replaces history and is synced to the layout invariants", () => {
    const opened = {
      ...Doc.sampleDocument,
      layout: { ...Doc.sampleDocument.layout, nodes: {} },
    };
    story(
      update,
      given({ ...baseModel, maybeSavedDocument: Option.none() }),
      message(Message.RequestedOpen()),
      Command.resolve(
        OpenFile,
        Message.SucceededOpenFile({ document: opened, path: "/models/x.domain.json" }),
      ),
      model((m) => {
        // Three entities and the Role enum.
        expect(Object.keys(m.history.present.layout.nodes)).toHaveLength(4);
        expect(m.history.past).toHaveLength(0);
        expect(isDirty(m)).toBe(false);
      }),
    );
  });

  test("a new model is undoable and forgets the file handle", () => {
    story(
      update,
      given({ ...baseModel, maybeFilePath: Option.some("/models/blog.domain.json") }),
      message(Message.RequestedNewDocument()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(0);
        expect(m.maybeFilePath).toEqual(Option.none());
        expect(isDirty(m)).toBe(true);
      }),
      message(Message.RequestedUndo()),
      model((m) => expect(m.history.present.entities).toHaveLength(3)),
    );
  });

  test("a failed open surfaces a notice", () => {
    story(
      update,
      given(baseModel),
      message(Message.RequestedOpen()),
      Command.resolve(OpenFile, Message.FailedOpenFile({ error: "bad file" })),
      model((m) => expect(m.maybeNotice).toEqual(Option.some({ tone: "Error", text: "bad file" }))),
    );
  });
});

describe("unsaved changes", () => {
  const rename = Message.ChangedDocumentName({ name: "Renamed" });

  test("an edit is dirty and undoing back to the saved document is clean", () => {
    const edited = update(baseModel, rename).model;
    expect(isDirty(baseModel)).toBe(false);
    expect(isDirty(edited)).toBe(true);
    expect(isDirty(update(edited, Message.RequestedUndo()).model)).toBe(false);
  });

  test("pan, zoom, and expansion alone stay clean", () => {
    const zoomed = update(baseModel, Message.RequestedZoomIn()).model;
    const expanded = update(zoomed, Message.ClickedToggleExpand({ nodeId: "e1" })).model;
    expect(expanded.history.present).not.toEqual(baseModel.history.present);
    expect(isDirty(expanded)).toBe(false);
  });

  test("save success records the written document, so a later edit stays dirty", () => {
    const editedDuringSave = update(update(baseModel, Message.RequestedSave()).model, rename).model;
    const saved = update(
      editedDuringSave,
      Message.SucceededSaveFile({ document: Doc.sampleDocument, path: "/models/blog.domain.json" }),
    ).model;
    expect(saved.maybeSavedDocument).toEqual(Option.some(Doc.sampleDocument));
    expect(isDirty(saved)).toBe(true);
  });
});

describe("window", () => {
  test("a close request with unsaved changes asks before closing", () => {
    story(
      update,
      given({ ...baseModel, maybeSavedDocument: Option.none() }),
      message(Message.RequestedWindowClose()),
      Command.expectExact(ConfirmCloseWindow),
      Command.resolve(ConfirmCloseWindow, Message.CancelledCloseWindow()),
      model((m) => expect(isDirty(m)).toBe(true)),
    );
  });
});

describe("external edits", () => {
  const PATH = "/models/blog.domain.json";
  const saved = Doc.syncLayout(Doc.sampleDocument);
  const onDisk: Model = {
    ...baseModel,
    history: History.init(saved),
    maybeFilePath: Option.some(PATH),
    maybeSavedDocument: Option.some(saved),
  };
  const theirs = Doc.renameEntity(saved, "e3", "Label");
  const arrived = (document: typeof saved) => Message.ReadFileOnDisk({ path: PATH, document });
  const step = (m: Model, msg: Message): Model => update(m, msg).model;
  // Commands carry their effect, so compare what they are, not how they run.
  const described = (commands: ReadonlyArray<{ name: string; args?: unknown }> | undefined) =>
    (commands ?? []).map(({ name, args }) => ({ name, args }));
  const entityName = (m: Model, entityId: string) =>
    Option.getOrThrow(Doc.findEntity(m.history.present, entityId)).name;

  test("a change on disk or a return to the window reads the open file back", () => {
    for (const signal of [Message.ChangedFileOnDisk(), Message.FocusedWindow()]) {
      expect(described(update(onDisk, signal).commands)).toEqual(
        described([CheckFileOnDisk({ path: PATH })]),
      );
      expect(update(baseModel, signal).commands ?? []).toEqual([]);
    }
  });

  test("a clean document takes the change, stays clean, and says so", () => {
    const m = step(onDisk, arrived(theirs));
    expect(entityName(m, "e3")).toBe("Label");
    expect(m.history.past).toHaveLength(1);
    expect(isDirty(m)).toBe(false);
    expect(m.maybePendingDiskDocument).toEqual(Option.none());
    expect(m.maybeNotice).toEqual(
      Option.some({ tone: "Info", text: "Updated from blog.domain.json" }),
    );
  });

  test("the viewport is never taken from disk", () => {
    const panned = {
      ...theirs,
      layout: { ...theirs.layout, viewport: { pan: { x: 9, y: 9 }, zoom: 2 } },
    };
    const m = step(onDisk, arrived(panned));
    expect(m.history.present.layout.viewport).toEqual(saved.layout.viewport);
  });

  test("unsaved edits merge with a change elsewhere and stay unsaved", () => {
    const edited = step(onDisk, Message.ChangedDocumentName({ name: "Mine" }));
    const m = step(edited, arrived(theirs));
    expect(m.history.present.name).toBe("Mine");
    expect(entityName(m, "e3")).toBe("Label");
    expect(m.maybeSavedDocument).toEqual(Option.some(theirs));
    expect(isDirty(m)).toBe(true);
  });

  test("a conflict keeps ours and the notice names it", () => {
    const edited = step(onDisk, Message.ChangedDocumentName({ name: "Mine" }));
    const m = step(edited, arrived(Doc.renameDocument(theirs, "Theirs")));
    expect(m.history.present.name).toBe("Mine");
    expect(entityName(m, "e3")).toBe("Label");
    expect(m.maybeNotice).toEqual(
      Option.some({
        tone: "Info",
        text: "Merged changes from blog.domain.json. Kept your version of Mine.",
      }),
    );
  });

  test("a long conflict list is capped", () => {
    const renamedAll = (document: typeof saved, suffix: string) =>
      ["e1", "e2", "e3"].reduce(
        (acc, id) => Doc.renameEntity(acc, id, `${id}${suffix}`),
        Doc.renameDocument(document, `Doc${suffix}`),
      );
    const ours = { ...onDisk, history: History.init(renamedAll(saved, "Ours")) };
    const m = step(ours, arrived(renamedAll(saved, "Theirs")));
    expect(Option.getOrThrow(m.maybeNotice).text).toMatch(/Kept your version of .+ and 1 more\.$/);
  });

  test("undo after a merge restores the document from before it", () => {
    const edited = step(onDisk, Message.ChangedDocumentName({ name: "Mine" }));
    const merged = step(edited, arrived(theirs));
    const undone = step(merged, Message.RequestedUndo());
    expect(undone.history.present).toEqual(edited.history.present);
    expect(entityName(undone, "e3")).toBe(entityName(onDisk, "e3"));
  });

  test("a change is held while renaming and merged once the rename commits or cancels", () => {
    const renaming = step(onDisk, Message.DoubleClickedEntityName({ entityId: "e1" }));
    expect(renaming.editor._tag).toBe("RenamingEntity");
    const held = step(renaming, arrived(theirs));
    expect(entityName(held, "e3")).toBe(entityName(onDisk, "e3"));
    expect(held.maybePendingDiskDocument).toEqual(Option.some(theirs));

    const typed = step(held, Message.UpdatedEntityDraftName({ name: "Member" }));
    const committed = step(typed, Message.PressedEnterKey());
    expect(entityName(committed, "e1")).toBe("Member");
    expect(entityName(committed, "e3")).toBe("Label");
    expect(committed.maybePendingDiskDocument).toEqual(Option.none());

    const cancelled = step(held, Message.PressedEscapeKey());
    expect(entityName(cancelled, "e1")).toBe("User");
    expect(entityName(cancelled, "e3")).toBe("Label");
  });

  test("only the latest change waits while busy", () => {
    const busy = {
      ...onDisk,
      editor: EditorState.RenamingEntity({ entityId: "e1", draftName: "User" }),
    };
    const latest = Doc.renameEntity(saved, "e3", "Newest");
    const held = step(step(busy, arrived(theirs)), arrived(latest));
    expect(held.maybePendingDiskDocument).toEqual(Option.some(latest));
    const applied = step(held, Message.PressedEscapeKey());
    expect(entityName(applied, "e3")).toBe("Newest");
    expect(applied.history.past).toHaveLength(1);
  });

  test("a change that reverts to the saved document drops what was pending", () => {
    const busy = {
      ...onDisk,
      editor: EditorState.RenamingEntity({ entityId: "e1", draftName: "User" }),
    };
    const m = step(step(busy, arrived(theirs)), arrived(saved));
    expect(m.maybePendingDiskDocument).toEqual(Option.none());
  });

  test("the saved document read back, as after our own save, is ignored", () => {
    const edited = step(onDisk, Message.ChangedDocumentName({ name: "Mine" }));
    const m = step(edited, arrived(saved));
    expect(m).toEqual(edited);
  });

  test("results for a file that is no longer open are ignored", () => {
    const stale = Message.ReadFileOnDisk({ path: "/models/other.domain.json", document: theirs });
    expect(step(onDisk, stale)).toEqual(onDisk);
  });

  test("an invalid file is reported once and the document is kept", () => {
    const invalid = Message.FailedReadFileOnDisk({ path: PATH, issue: "Invalid" });
    const first = step(onDisk, invalid);
    expect(first.history).toBe(onDisk.history);
    expect(first.maybeNotice).toEqual(
      Option.some({
        tone: "Error",
        text: "blog.domain.json on disk isn't a valid model right now. Keeping your version.",
      }),
    );
    const dismissed = step(first, Message.ClickedDismissNotice());
    expect(step(dismissed, invalid).maybeNotice).toEqual(Option.none());
    // Once it's valid again, a later problem is reported afresh.
    const fixed = step(dismissed, arrived(theirs));
    expect(step(step(fixed, Message.ClickedDismissNotice()), invalid).maybeNotice).not.toEqual(
      Option.none(),
    );
  });

  test("a missing file makes the document unsaved, so Save writes it back", () => {
    const m = step(onDisk, Message.FailedReadFileOnDisk({ path: PATH, issue: "Missing" }));
    expect(isDirty(m)).toBe(true);
    expect(m.maybeFilePath).toEqual(Option.some(PATH));
    expect(Option.getOrThrow(m.maybeNotice).tone).toBe("Error");
    expect(described(update(m, Message.RequestedSave()).commands)).toEqual(
      described([SaveFile({ document: m.history.present, maybePath: Option.some(PATH) })]),
    );
  });

  test("without a saved document a different file waits for Reload from disk", () => {
    const missing = step(onDisk, Message.FailedReadFileOnDisk({ path: PATH, issue: "Missing" }));
    const m = step(step(missing, Message.ClickedDismissNotice()), arrived(theirs));
    expect(entityName(m, "e3")).toBe(entityName(onDisk, "e3"));
    expect(Option.getOrThrow(m.maybeNotice).text).toMatch(/changed on disk\. Reload from disk/);
    // The same content back on disk is saved again.
    const restored = step(missing, arrived(saved));
    expect(isDirty(restored)).toBe(false);
  });

  test("save merges a pending change first, so it isn't overwritten", () => {
    const busy = {
      ...onDisk,
      editor: EditorState.RenamingEntity({ entityId: "e1", draftName: "Member" }),
    };
    const held = step(busy, arrived(theirs));
    const { model: m, commands } = update(held, Message.RequestedSave());
    expect(entityName(m, "e3")).toBe("Label");
    expect(described(commands)).toEqual(
      described([SaveFile({ document: m.history.present, maybePath: Option.some(PATH) })]),
    );
  });

  test("Reload from disk discards unsaved changes as one undoable step", () => {
    const edited = step(onDisk, Message.ChangedDocumentName({ name: "Mine" }));
    expect(described(update(edited, Message.PressedReloadFromDiskKey()).commands)).toEqual(
      described([ReloadFileFromDisk({ path: PATH })]),
    );
    const reloaded = step(edited, Message.SucceededReloadFile({ path: PATH, document: theirs }));
    expect(reloaded.history.present.name).toBe(saved.name);
    expect(entityName(reloaded, "e3")).toBe("Label");
    expect(isDirty(reloaded)).toBe(false);
    expect(reloaded.maybeNotice).toEqual(
      Option.some({ tone: "Info", text: "Reloaded blog.domain.json" }),
    );
    const undone = step(reloaded, Message.RequestedUndo());
    expect(undone.history.present).toEqual(edited.history.present);
  });

  test("Reload from disk without a file says there's nothing to reload", () => {
    const result = update(baseModel, Message.PressedReloadFromDiskKey());
    expect(result.commands ?? []).toEqual([]);
    expect(result.model.maybeNotice).toEqual(
      Option.some({ tone: "Info", text: "No file to reload." }),
    );
  });
});
