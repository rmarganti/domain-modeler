import { Effect, Option, Stream } from "effect";
import { Dom } from "foldkit";
import { describe, expect, test, vi } from "vitest";

import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import * as Ids from "./domain/ids";
import { bindingsFor, formatKeys, helpSectionOf, KEYMAP, keysFor } from "./keymap";
import { Message } from "./message";
import { CardRow, EditorState, Selection, isDirty, type Model } from "./model";
import { update } from "./update";

const card = (nodeId: string, x: number, y: number): Geometry.CardBounds => ({
  nodeId,
  rect: { x: x - 50, y: y - 20, width: 100, height: 40 },
});
const origin = { x: 0, y: 0 };
const chosen = (cards: ReadonlyArray<Geometry.CardBounds>, direction?: Geometry.SpatialDirection) =>
  Option.map(Geometry.nearestCard(cards, origin, direction), ({ nodeId }) => nodeId);

const document = {
  ...Doc.sampleDocument,
  layout: {
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: {
      e1: { position: { x: 100, y: 100 }, isExpanded: false },
      e2: { position: { x: 500, y: 100 }, isExpanded: false },
      e3: { position: { x: 100, y: 500 }, isExpanded: false },
      t1: { position: { x: 500, y: 500 }, isExpanded: false },
    },
  },
};
const initial: Model = {
  history: History.init(document),
  idState: Ids.seed([1, 2, 3, 4]),
  editor: EditorState.Idle(),
  selection: Selection.NoSelection(),
  screen: { width: 1200, height: 900 },
  panKey: "Released",
  maybeFileName: Option.none(),
  maybeSavedDocument: Option.some(document),
  maybeNotice: Option.none(),
};
const selection = (id: string) =>
  id === "t1"
    ? Selection.SelectedEnum({ typeId: id, row: CardRow.Title() })
    : Selection.SelectedEntity({ entityId: id, row: CardRow.Title() });
const navigate = (m: Model, direction: Geometry.SpatialDirection) =>
  update(m, Message.NavigatedCard({ direction })).model;

describe("spatial geometry", () => {
  const grid = [
    card("self", 0, 0),
    card("left", -100, 0),
    card("right", 100, 0),
    card("up", 0, -100),
    card("down", 0, 100),
  ];
  test.each(["Left", "Right", "Up", "Down"] as const)("grid selects %s", (direction) => {
    expect(chosen(grid, direction)).toEqual(Option.some(direction.toLowerCase()));
  });

  test("cone includes 45 degrees but excludes behind, coincident and outside centers", () => {
    expect(
      chosen([card("self", 0, 0), card("behind", -10, 0), card("outside", 10, 11)], "Right"),
    ).toEqual(Option.none());
    expect(chosen([card("boundary", 10, -10)], "Right")).toEqual(Option.some("boundary"));
    expect(chosen([], "Up")).toEqual(Option.none());
  });

  test("axis + twice perpendicular penalizes off-axis cards", () => {
    expect(chosen([card("off-axis", 60, 30), card("on-axis", 100, 0)], "Right")).toEqual(
      Option.some("on-axis"),
    );
    expect(chosen([card("off-axis", 20, 20), card("on-axis", 100, 0)], "Right")).toEqual(
      Option.some("off-axis"),
    );
  });

  test("nearest center is Euclidean without a direction; ties use ID, not input order", () => {
    const cards = [card("z", 30, 40), card("a", -50, 0), card("far", 60, 0)];
    expect(chosen(cards)).toEqual(Option.some("a"));
    expect(chosen([...cards].reverse())).toEqual(Option.some("a"));
    const tied = [card("z", 100, 0), card("a", 60, 20)];
    expect(chosen(tied, "Right")).toEqual(Option.some("a"));
    expect(chosen([...tied].reverse(), "Right")).toEqual(Option.some("a"));
    expect(chosen([])).toEqual(Option.none());
  });

  test("bounds retain identity, support both card kinds, and ignore missing/orphan layouts", () => {
    const bounds = Geometry.cardBounds({
      ...document,
      layout: {
        ...document.layout,
        nodes: {
          e1: document.layout.nodes.e1,
          t1: document.layout.nodes.t1,
          ghost: document.layout.nodes.e2,
        },
      },
    });
    expect(bounds.map(({ nodeId }) => nodeId)).toEqual(["e1", "t1"]);
    expect(bounds.map(({ rect }) => rect)).toEqual(
      Geometry.cardRects({ ...document, entities: document.entities.slice(0, 1) }),
    );
  });

  test.each([
    [
      { x: -10, y: 100, width: 100, height: 40 },
      { x: 34, y: 0 },
    ],
    [
      { x: 750, y: 100, width: 100, height: 40 },
      { x: -74, y: 0 },
    ],
    [
      { x: 100, y: -10, width: 100, height: 40 },
      { x: 0, y: 34 },
    ],
    [
      { x: 100, y: 570, width: 100, height: 40 },
      { x: 0, y: -34 },
    ],
    [
      { x: -10, y: 570, width: 100, height: 40 },
      { x: 34, y: -34 },
    ],
  ])("minimum reveal pan for %j", (rect, pan) => {
    expect(
      Geometry.revealRect({ pan: origin, zoom: 1 }, rect, { width: 800, height: 600 }),
    ).toEqual({ pan, zoom: 1 });
  });

  test("visible cards do not pan, including exact margins; pan and zoom are screen-space", () => {
    const camera = { pan: { x: 4, y: -16 }, zoom: 2 };
    expect(
      Geometry.revealRect(
        camera,
        { x: 10, y: 20, width: 100, height: 40 },
        { width: 800, height: 600 },
      ),
    ).toBe(camera);
    expect(
      Geometry.revealRect(
        camera,
        { x: -20, y: 20, width: 100, height: 40 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ pan: { x: 64, y: -16 }, zoom: 2 });
  });

  test("oversized cards align the nearest edge and do not oscillate; tiny viewports stay finite", () => {
    const rect = { x: 100, y: 100, width: 1000, height: 800 };
    const camera = Geometry.revealRect({ pan: origin, zoom: 1 }, rect, { width: 800, height: 600 });
    expect(camera.pan).toEqual({ x: -76, y: -76 });
    expect(Geometry.revealRect(camera, rect, { width: 800, height: 600 })).toBe(camera);
    expect(Geometry.revealRect({ pan: origin, zoom: 1 }, rect, { width: 0, height: 0 })).toEqual({
      pan: { x: -100, y: -100 },
      zoom: 1,
    });
  });
});

describe("spatial card navigation", () => {
  test("real binding listeners prevent browser Ctrl+H/K defaults but leave editable targets alone", async () => {
    const target = window.document.createElement("div");
    const input = window.document.createElement("input");
    target.append(input);
    window.document.body.append(target);
    try {
      for (const platform of ["Apple", "Other"] as const) {
        let resolveReady = () => {};
        const ready = new Promise<void>((resolve) => {
          resolveReady = resolve;
        });
        const addListener = target.addEventListener.bind(target);
        const listenerSpy = vi
          .spyOn(target, "addEventListener")
          .mockImplementation((type, listener, options) => {
            addListener(type, listener, options);
            if (type === "keydown") resolveReady();
          });
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.forkScoped(
                Stream.runDrain(
                  Dom.streamFromKeyBindings({
                    target,
                    modKey: platform === "Apple" ? "Meta" : "Control",
                    bindings: bindingsFor("Normal", platform),
                  }),
                ),
                { startImmediately: true },
              );
              yield* Effect.promise(() => ready);
              for (const key of ["h", "j", "k", "l"]) {
                const event = new KeyboardEvent("keydown", {
                  key,
                  ctrlKey: true,
                  bubbles: true,
                  cancelable: true,
                });
                target.dispatchEvent(event);
                expect(event.defaultPrevented).toBe(true);
                const typing = new KeyboardEvent("keydown", {
                  key,
                  ctrlKey: true,
                  bubbles: true,
                  cancelable: true,
                });
                input.dispatchEvent(typing);
                expect(typing.defaultPrevented).toBe(false);
              }
            }),
          ),
        );
        listenerSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
      target.remove();
    }
  });
  test.each([
    ["e1", "Right", "e2"],
    ["e1", "Down", "e3"],
    ["e2", "Left", "e1"],
    ["e2", "Down", "t1"],
    ["t1", "Left", "e3"],
    ["t1", "Up", "e2"],
    ["e3", "Up", "e1"],
    ["e3", "Right", "t1"],
  ] as const)("%s %s selects %s Title without panning or resizing", (from, direction, to) => {
    const start = { ...initial, selection: selection(from) };
    const result = navigate(start, direction);
    expect(result.selection).toEqual(selection(to));
    expect(result.history).toBe(start.history);
    expect(isDirty(result)).toBe(false);
    expect(result.editor).toEqual(EditorState.Idle());
  });

  test.each(["Left", "Up"] as const)(
    "no %s candidate preserves even a field cursor",
    (direction) => {
      const start = {
        ...initial,
        selection: Selection.SelectedEntity({
          entityId: "e1",
          row: CardRow.Attribute({ attributeId: "p2" }),
        }),
      };
      expect(navigate(start, direction)).toBe(start);
    },
  );

  test.each(["Left", "Down", "Up", "Right"] as const)(
    "%s with no/relationship selection chooses nearest viewport center",
    (direction) => {
      for (const selected of [
        Selection.NoSelection(),
        Selection.SelectedAssociation({ associationId: "r1" }),
      ]) {
        const start = {
          ...initial,
          selection: selected,
          editor:
            selected._tag === "SelectedAssociation"
              ? EditorState.EditingAssociation({ associationId: "r1" })
              : EditorState.Idle(),
        };
        const result = navigate(start, direction);
        expect(result.selection).toEqual(selection("t1"));
        expect(result.editor).toEqual(EditorState.Idle());
        expect(result.history).toBe(start.history);
      }
    },
  );

  test("nearest viewport center accounts for pan and zoom", () => {
    const doc = Doc.setViewport(document, { zoom: 2, pan: { x: 200, y: 206 } });
    expect(navigate({ ...initial, history: History.init(doc) }, "Down").selection).toEqual(
      selection("e1"),
    );
  });

  test.each([false, true])(
    "offscreen pan preserves zoom, expansion, dirty %s, past and redo",
    (dirty) => {
      for (const isExpanded of [true, false]) {
        for (const zoom of [0.5, 2]) {
          const doc = Doc.setViewport(Doc.setExpanded(document, "e1", isExpanded), {
            pan: { x: -500, y: -500 },
            zoom,
          });
          const start: Model = {
            ...initial,
            selection: selection("e2"),
            maybeSavedDocument: dirty ? Option.none() : Option.some(doc),
            history: { present: doc, past: [doc], future: [doc] },
          };
          const result = navigate(start, "Left");
          expect(result.selection).toEqual(selection("e1"));
          expect(result.history.present.layout.viewport).toEqual({
            zoom,
            pan: { x: 24 - 100 * zoom, y: 24 - 100 * zoom },
          });
          expect(result.history.present.layout.nodes).toBe(doc.layout.nodes);
          expect(result.history.past).toBe(start.history.past);
          expect(result.history.future).toBe(start.history.future);
          expect(isDirty(result)).toBe(dirty);
        }
      }
    },
  );

  test("value cursors navigate by card identity, and enum expansion survives", () => {
    const doc = Doc.setExpanded(document, "t1", true);
    const start = {
      ...initial,
      history: History.init(doc),
      selection: Selection.SelectedEnum({ typeId: "t1", row: CardRow.Value({ valueId: "v1" }) }),
    };
    const moved = navigate(start, "Left");
    expect(moved.selection).toEqual(selection("e3"));
    expect(navigate(moved, "Right").selection).toEqual(selection("t1"));
    expect(moved.history.present.layout.nodes).toBe(doc.layout.nodes);
  });

  test("empty document is unchanged and missing selected card/layout falls back safely", () => {
    const empty = { ...initial, history: History.init(Doc.emptyDocument("Empty")) };
    expect(navigate(empty, "Right")).toBe(empty);
    expect(navigate({ ...initial, selection: selection("missing") }, "Left").selection).toEqual(
      selection("t1"),
    );
    const doc = {
      ...document,
      layout: { ...document.layout, nodes: { t1: document.layout.nodes.t1 } },
    };
    expect(
      navigate({ ...initial, history: History.init(doc), selection: selection("e1") }, "Left")
        .selection,
    ).toEqual(selection("t1"));
  });

  test("late messages cannot interrupt non-Normal modes", () => {
    for (const opener of [
      Message.PressedFindCardKey(),
      Message.PressedShortcutsKey(),
      Message.PressedNewKey(),
      Message.PressedEditKey(),
      Message.PressedPort({ entityId: "e1", button: 0, clientX: 100, clientY: 100 }),
      Message.PressedNodeHeader({ entityId: "e1", button: 0, clientX: 100, clientY: 100 }),
    ]) {
      const start = update({ ...initial, selection: selection("e1") }, opener).model;
      expect(navigate(start, "Right")).toBe(start);
    }
  });

  test("registry keeps spatial keys Normal-only, plain h/l unbound, and redo intact", () => {
    for (const platform of ["Apple", "Other"] as const) {
      const bindings = bindingsFor("Normal", platform);
      for (const [key, direction] of [
        ["H", "Left"],
        ["J", "Down"],
        ["K", "Up"],
        ["L", "Right"],
      ] as const) {
        const binding = bindings.find(({ keys }) => keys === `Control+${key}`);
        expect(binding?.mapEvent(new KeyboardEvent("keydown"))).toEqual(
          Message.NavigatedCard({ direction }),
        );
        expect(binding?.whileTyping).toBeUndefined();
        for (const mode of ["Text", "Choosing", "Picking", "Pointer", "Help"] as const) {
          expect(bindingsFor(mode, platform).some(({ keys }) => keys === `Control+${key}`)).toBe(
            false,
          );
        }
      }
      expect(bindings.some(({ keys }) => keys === "H" || keys === "L")).toBe(false);
      expect(
        bindings.find(({ keys }) => keys === "Control+R")?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.RequestedRedo());
      const find = KEYMAP.find(({ id }) => id === "findCard")!;
      expect(formatKeys(keysFor(find, platform), platform)).toBe(
        platform === "Apple" ? "⌘K" : "Ctrl+Shift+K",
      );
      expect(
        bindings
          .find(({ keys }) => keys === keysFor(find, platform)[0])
          ?.mapEvent(new KeyboardEvent("keydown")),
      ).toEqual(Message.PressedFindCardKey());
    }
    for (const id of ["cardLeft", "cardDown", "cardUp", "cardRight"])
      expect(helpSectionOf(id)).toBe("Move around");
  });
});
