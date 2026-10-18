import { Option, Schema } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";

import { ConfirmCloseWindow, FocusInput, ForgetActiveFile, OpenFile, SaveFile } from "./command";
import * as Doc from "./domain/document";
import * as History from "./domain/history";
import { DomainModelDocumentJsonString } from "./domain/schema";
import { Message } from "./message";
import { EditorState, Selection, type Model } from "./model";
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

describe("entities", () => {
  test("c, typing, and Enter create a selected entity", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedCreateEntityKey()),
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
      message(Message.PressedCreateEntityKey()),
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
        expect(m.history.present.relationships).toHaveLength(0);
        expect(m.selection).toEqual(Selection.NoSelection());
      }),
      message(Message.PressedUndoKey()),
      model((m) => {
        expect(m.history.present.entities).toHaveLength(3);
        expect(m.history.present.relationships).toHaveLength(2);
      }),
      message(Message.PressedRedoKey()),
      model((m) => expect(m.history.present.entities).toHaveLength(2)),
    );
  });
});

describe("properties", () => {
  test("adding a field opens it for editing and saving applies the draft", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedAddProperty({ entityId: "e3" })),
      focused,
      model((m) => {
        expect(m.editor._tag).toBe("EditingProperty");
        expect(m.history.present.layout.nodes["e3"]?.isExpanded).toBe(true);
      }),
      message(Message.UpdatedPropertyDraftName({ name: "kind" })),
      message(Message.SelectedPropertyDraftType({ type: "Literal" })),
      message(Message.UpdatedPropertyDraftLiteralOptions({ text: "a, b, , a" })),
      message(Message.ToggledPropertyDraftFlag({ flag: "isNullable" })),
      message(Message.PressedEnterKey()),
      model((m) => {
        const tag = Option.getOrThrow(Doc.findEntity(m.history.present, "e3"));
        expect(tag.properties.at(-1)).toEqual({
          id: "p11",
          name: "kind",
          type: "Literal",
          literalOptions: ["a", "b"],
          isOptional: false,
          isNullable: true,
        });
        // One snapshot for adding the field, one for saving the edit.
        expect(m.history.past).toHaveLength(2);
      }),
    );
  });

  test("cancelling an edit leaves the field unchanged", () => {
    story(
      update,
      given(baseModel),
      message(Message.ClickedEditProperty({ entityId: "e1", propertyId: "p2" })),
      focused,
      message(Message.UpdatedPropertyDraftName({ name: "mail" })),
      message(Message.PressedEscapeKey()),
      model((m) => {
        expect(m.history.present).toEqual(baseModel.history.present);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
    );
  });
});

describe("relationships", () => {
  test("dropping a port drag on another entity creates an edge and opens the inspector", () => {
    story(
      update,
      given(baseModel),
      message(Message.PressedPort({ entityId: "e3", ...press, clientX: 1180, clientY: 162 })),
      model((m) => expect(m.editor._tag).toBe("ConnectingRelationship")),
      message(Message.MovedPointer({ clientX: 300, clientY: 160 })),
      message(
        Message.ReleasedPointer({
          clientX: 300,
          clientY: 160,
          maybeTargetEntityId: Option.some("e1"),
        }),
      ),
      model((m) => {
        expect(m.editor).toEqual(EditorState.EditingRelationship({ relationshipId: "r3" }));
        expect(Option.getOrThrow(Doc.findRelationship(m.history.present, "r3"))).toEqual({
          id: "r3",
          sourceEntityId: "e3",
          targetEntityId: "e1",
          cardinality: "1:N",
        });
        // The saved file links the two entities and nothing else: no field keys.
        const json = Schema.encodeSync(DomainModelDocumentJsonString)(m.history.present);
        const saved = JSON.parse(json).relationships.at(-1);
        expect(Object.keys(saved).sort()).toEqual([
          "cardinality",
          "id",
          "sourceEntityId",
          "targetEntityId",
        ]);
      }),
      message(Message.SelectedCardinality({ relationshipId: "r3", cardinality: "1:1" })),
      message(Message.PressedDeleteKey()),
      model((m) => {
        expect(m.history.present.relationships).toHaveLength(2);
        expect(m.editor).toEqual(EditorState.Idle());
      }),
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
        expect(m.history.present.relationships).toHaveLength(2);
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
      model((m) => expect(m.history.present.relationships).toHaveLength(2)),
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
        expect(Object.keys(m.history.present.layout.nodes)).toHaveLength(3);
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
