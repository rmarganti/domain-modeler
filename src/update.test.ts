import { Option, Schema } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { ConfirmCloseWindow, FocusInput, ForgetActiveFile, OpenFile, SaveFile } from "./command";
import * as Doc from "./domain/document";
import * as History from "./domain/history";
import { DomainModelDocumentJsonString } from "./domain/schema";
import { Message } from "./message";
import { EditorState, Selection, type Model } from "./model";
import { bindingsFor, toKeyMode } from "./subscription";
import { update } from "./update";

// Viewport at pan (0, 0) and zoom 1, so screen and world coordinates match.
const baseModel: Model = {
  history: History.init(Doc.sampleDocument),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  screen: { width: 1200, height: 800 },
  panKey: "Released",
  maybeFileName: Option.none(),
  saveStatus: "Clean",
  maybeNotice: Option.none(),
};

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
        expect(m.selection).toEqual(Selection.SelectedEntity({ entityId: "e3" }));
        expect(m.saveStatus).toBe("Dirty");
      }),
    );
  });

  test("a press and release without movement toggles expansion without history", () => {
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
        expect(m.history.present.layout.nodes["e3"]?.isExpanded).toBe(true);
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
      given({ ...baseModel, selection: Selection.SelectedEntity({ entityId: "e1" }) }),
      message(Message.PressedCanvas(press)),
      model((m) => expect(m.selection).toEqual(Selection.NoSelection())),
    );
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
        expect(m.saveStatus).toBe("Clean");
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
      const viaKey = update(current, Message.PressedNewDocumentKey());
      const viaButton = update(current, Message.ClickedNewDocument());
      expect(viaKey.model).toEqual(viaButton.model);
      expect(viaKey.commands).toEqual(viaButton.commands);
      expect(viaKey.commands).toEqual([ForgetActiveFile()]);
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
      expect(binding?.mapEvent(new KeyboardEvent("keydown"))._tag).toBe("PressedNewDocumentKey");
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
  const selected: Model = { ...baseModel, selection: Selection.SelectedEntity({ entityId: "e1" }) };

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
        expect(m.saveStatus).toBe("Clean");
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
        expect(m.selection).toEqual(Selection.SelectedEntity({ entityId: "e4" }));
        const created = Option.getOrThrow(Doc.findEntity(m.history.present, "e4"));
        expect(created.name).toBe("Comment");
        expect(m.history.present.layout.nodes["e4"]).toBeDefined();
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
      given({ ...baseModel, selection: Selection.SelectedEntity({ entityId: "e3" }) }),
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
      given({ ...baseModel, selection: Selection.SelectedEntity({ entityId: "e2" }) }),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(2);
        expect(m.history.present.associations).toHaveLength(0);
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.PressedUndoKey()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(3);
        expect(m.history.present.associations).toHaveLength(2);
      }),
      message(Message.PressedRedoKey()),
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
        expect(tag.attributes.at(-1)).toEqual({
          id: "p11",
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
        expect(m.editor).toEqual(EditorState.EditingAssociation({ associationId: "r3" }));
        expect(Option.getOrThrow(Doc.findAssociation(m.history.present, "r3"))).toEqual({
          id: "r3",
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
      message(Message.PressedUndoKey()),
      model((m) => expect(r1Ends(m)[1].role).toBeUndefined()),
      message(Message.PressedUndoKey()),
      model((m) => expect(r1Ends(m)[0].multiplicity).toEqual({ min: 1, max: "one" })),
      message(Message.PressedRedoKey()),
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
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t2" }));
        expect(Option.getOrThrow(Doc.findEnum(m.history.present, "t2")).name).toBe("Status");
        expect(m.history.present.layout.nodes["t2"]).toBeDefined();
      }),
      message(Message.PressedUndoKey()),
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
      message(Message.PressedUndoKey()),
      model((m) => expect(findRole(m).name).toBe("Role")),
    );
  });

  test("Enter on a selected enum expands it and starts renaming", () => {
    story(
      update,
      given({ ...baseModel, selection: Selection.SelectedEnum({ typeId: "t1" }) }),
      message(Message.PressedEnterKey()),
      focused,
      model((m) => {
        expect(m.editor).toEqual(EditorState.RenamingEnum({ typeId: "t1", draftName: "Role" }));
        expect(m.history.present.layout.nodes["t1"]?.isExpanded).toBe(true);
      }),
    );
  });

  test("adding a value opens it for editing and saving applies the draft", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddEnumValue({ typeId: "t1" })),
      focused,
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.EditingEnumValue({
            typeId: "t1",
            valueId: "v4",
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
          id: "v4",
          name: "guest",
          description: "Not signed in",
        });
        // One snapshot for adding the value, one for saving the edit.
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.PressedUndoKey()),
      model((m) => expect(findRole(m).values.at(-1)).toEqual({ id: "v4", name: "value4" })),
      message(Message.PressedUndoKey()),
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
      message(Message.PressedUndoKey()),
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
      message(Message.PressedUndoKey()),
      model((m) => expect(roleValues(m)).toEqual(["reader", "admin", "author"])),
      message(Message.PressedUndoKey()),
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
      given({ ...baseModel, selection: Selection.SelectedEnum({ typeId: "t1" }) }),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.types).toHaveLength(0);
        expect(m.history.present.layout.nodes["t1"]).toBeUndefined();
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.PressedUndoKey()),
      model((m) => {
        expect(findRole(m).name).toBe("Role");
        expect(m.history.present.layout.nodes["t1"]).toBeDefined();
      }),
      message(Message.PressedRedoKey()),
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
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t1" }));
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
      message(Message.PressedUndoKey()),
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
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddAttribute({ entityId: "e2" })),
      focused,
      message(Message.UpdatedAttributeDraftName({ name: "status" })),
      message(Message.SelectedAttributeDraftNewEnum()),
      focused,
      model((m) => {
        expect(m.editor).toEqual(
          EditorState.EditingEnumValue({
            typeId: "t2",
            valueId: "v4",
            draft: { name: "", description: "" },
            save: "Amend",
          }),
        );
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t2" }));
        expect(post(m).attributes.at(-1)).toMatchObject({
          id: "p11",
          name: "status",
          type: { typeId: "t2" },
        });
        expect(Option.getOrThrow(Doc.findEnum(m.history.present, "t2")).name).toBe("Status");
        expect(m.history.present.layout.nodes["t2"]?.isExpanded).toBe(true);
        // One snapshot for adding the field, one for the whole "New enum…".
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.UpdatedEnumValueDraftName({ name: "draft" })),
      message(Message.PressedEnterKey()),
      model((m) => {
        expect(m.editor).toEqual(EditorState.Idle());
        expect(Option.getOrThrow(Doc.findEnum(m.history.present, "t2")).values).toEqual([
          { id: "v4", name: "draft" },
        ]);
        // Naming the first value folds into the same step.
        expect(m.history.past).toHaveLength(2);
      }),
      message(Message.PressedUndoKey()),
      model((m) => {
        expect(Doc.findEnum(m.history.present, "t2")).toEqual(Option.none());
        expect(m.history.present.layout.nodes["t2"]).toBeUndefined();
        expect(post(m).attributes.at(-1)).toEqual(Doc.newAttribute("p11", "field3"));
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.PressedRedoKey()),
      model((m) => {
        expect(Option.getOrThrow(Doc.findEnum(m.history.present, "t2")).values).toEqual([
          { id: "v4", name: "draft" },
        ]);
        expect(post(m).attributes.at(-1)?.type).toEqual({ typeId: "t2" });
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
        expect(Option.getOrThrow(Doc.findEnum(m.history.present, "t2")).name).toBe("NewEnum");
        // A blank draft name keeps the field's own name.
        expect(post(m).attributes[0]).toMatchObject({ name: "title", type: { typeId: "t2" } });
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
        expect(m.selection).toEqual(Selection.SelectedEnum({ typeId: "t1" }));
        expect(m.history.present.layout.viewport).toEqual(
          baseModel.history.present.layout.viewport,
        );
        expect(m.history.past).toHaveLength(0);
      }),
    );
  });
});

describe("files", () => {
  test("save hands the committed document to SaveFile", () => {
    story(
      update,
      given({
        ...baseModel,
        editor: EditorState.RenamingEntity({ entityId: "e3", draftName: "Label" }),
      }),
      message(Message.PressedSaveKey()),
      Command.expectHas(SaveFile),
      Command.resolve(SaveFile, Message.SucceededSaveFile({ fileName: "blog.domain.json" })),
      model((m) => {
        expect(m.saveStatus).toBe("Clean");
        expect(m.maybeFileName).toEqual(Option.some("blog.domain.json"));
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
      given({ ...baseModel, saveStatus: "Dirty" }),
      message(Message.PressedOpenKey()),
      Command.resolve(
        OpenFile,
        Message.SucceededOpenFile({ document: opened, fileName: "x.domain.json" }),
      ),
      model((m) => {
        // Three entities and the Role enum.
        expect(Object.keys(m.history.present.layout.nodes)).toHaveLength(4);
        expect(m.history.past).toHaveLength(0);
        expect(m.saveStatus).toBe("Clean");
      }),
    );
  });

  test("a new model is undoable and forgets the file handle", () => {
    story(
      update,
      given({ ...baseModel, maybeFileName: Option.some("blog.domain.json") }),
      message(Message.ClickedNewDocument()),
      Command.resolve(ForgetActiveFile, Message.CompletedForgetActiveFile()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(0);
        expect(m.maybeFileName).toEqual(Option.none());
      }),
      message(Message.ClickedUndo()),
      model((m) => expect(m.history.present.entities).toHaveLength(3)),
    );
  });

  test("a failed open surfaces a notice", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedOpen()),
      Command.resolve(OpenFile, Message.FailedOpenFile({ error: "bad file" })),
      model((m) => expect(m.maybeNotice).toEqual(Option.some({ tone: "Error", text: "bad file" }))),
    );
  });
});

describe("window", () => {
  test("a close request with unsaved changes asks before closing", () => {
    story(
      update,
      given({ ...baseModel, saveStatus: "Dirty" }),
      message(Message.RequestedWindowClose()),
      Command.expectExact(ConfirmCloseWindow),
      Command.resolve(ConfirmCloseWindow, Message.CancelledCloseWindow()),
      model((m) => expect(m.saveStatus).toBe("Dirty")),
    );
  });
});
