import { Option, Schema } from "effect";
import { describe, expect, test } from "vitest";

import * as Diagnostics from "./diagnostics";
import * as Doc from "./document";
import { bezierRouter } from "./edgeRouter";
import * as Geometry from "./geometry";
import * as History from "./history";
import { DomainModelDocumentJsonString, type DomainModelDocument } from "./schema";

const sample = Doc.sampleDocument;

describe("document", () => {
  test("nextId never collides with existing ids", () => {
    expect(Doc.nextId(sample, "e")).toBe("e4");
    expect(Doc.nextId(sample, "p")).toBe("p11");
    expect(Doc.nextId(sample, "r")).toBe("r3");
    expect(Doc.nextId(Doc.emptyDocument("x"), "e")).toBe("e1");
  });

  test("syncLayout staggers missing nodes and prunes orphans", () => {
    const document: DomainModelDocument = {
      ...sample,
      layout: {
        ...sample.layout,
        nodes: {
          e1: { position: { x: 80, y: 80 }, isExpanded: false },
          ghost: { position: { x: 0, y: 0 }, isExpanded: true },
        },
      },
    };
    const synced = Doc.syncLayout(document);
    expect(Object.keys(synced.layout.nodes).sort()).toEqual(["e1", "e2", "e3"]);
    // e1 occupies the first stagger slot, so e2 and e3 take the next ones.
    expect(synced.layout.nodes["e2"]?.position).toEqual({ x: 340, y: 80 });
    expect(synced.layout.nodes["e3"]?.position).toEqual({ x: 600, y: 80 });
  });

  test("deleteEntity cascades to its relationships and layout node", () => {
    const next = Doc.deleteEntity(sample, "e2");
    expect(next.entities.map((entity) => entity.id)).toEqual(["e1", "e3"]);
    expect(next.relationships).toEqual([]);
    expect(next.layout.nodes["e2"]).toBeUndefined();
  });

  test("deleteProperty removes the field and leaves relationships alone", () => {
    const next = Doc.deleteProperty(sample, "e1", "p3");
    expect(Option.getOrThrow(Doc.findEntity(next, "e1")).properties.map((p) => p.id)).toEqual([
      "p2",
      "p4",
    ]);
    expect(next.relationships).toEqual(sample.relationships);
  });

  test("moveProperty swaps with its neighbor and ignores out of range moves", () => {
    const moved = Doc.moveProperty(sample, "e1", "p3", "Up");
    expect(Option.getOrThrow(Doc.findEntity(moved, "e1")).properties.map((p) => p.id)).toEqual([
      "p3",
      "p2",
      "p4",
    ]);
    expect(Doc.moveProperty(sample, "e1", "p2", "Up")).toEqual(sample);
  });

  test("reverseRelationship swaps the entity IDs", () => {
    const reversed = Option.getOrThrow(
      Doc.findRelationship(Doc.reverseRelationship(sample, "r1"), "r1"),
    );
    expect(reversed).toEqual({
      id: "r1",
      name: "writes",
      sourceEntityId: "e2",
      targetEntityId: "e1",
      cardinality: "1:N",
    });
  });

  test("addEntity avoids overlapping existing nodes", () => {
    const next = Doc.addEntity(sample, "e4", "Comment", { x: 120, y: 140 });
    const position = next.layout.nodes["e4"]?.position;
    expect(position).toBeDefined();
    expect(position).not.toEqual({ x: 120, y: 140 });
  });

  test("the document codec round-trips", () => {
    const json = Schema.encodeSync(DomainModelDocumentJsonString)(sample);
    expect(Schema.decodeUnknownSync(DomainModelDocumentJsonString)(json)).toEqual(sample);
  });

  test("the document codec rejects malformed input", () => {
    expect(() =>
      Schema.decodeUnknownSync(DomainModelDocumentJsonString)('{"version":"2.0.0"}'),
    ).toThrow();
  });
});

describe("history", () => {
  const renamed = (name: string) => (document: DomainModelDocument) =>
    Doc.renameDocument(document, name);

  test("commit pushes a snapshot and clears the redo branch", () => {
    const history = History.commit(History.init(sample), renamed("A"));
    const undone = Option.getOrThrow(History.undo(history));
    expect(undone.present.name).toBe("Blog");
    expect(undone.future).toHaveLength(1);
    const branched = History.commit(undone, renamed("B"));
    expect(branched.future).toEqual([]);
    expect(branched.past).toHaveLength(1);
  });

  test("a commit that changes nothing records nothing", () => {
    const history = History.init(sample);
    expect(History.commit(history, (document) => ({ ...document }))).toBe(history);
  });

  test("past is capped at 50 snapshots", () => {
    const history = Array.from({ length: 60 }, (_, index) => index).reduce(
      (acc, index) => History.commit(acc, renamed(`v${index}`)),
      History.init(sample),
    );
    expect(history.past).toHaveLength(History.MAX_SNAPSHOTS);
    expect(history.present.name).toBe("v59");
  });

  test("undo and redo keep the current viewport and expansion", () => {
    const moved = History.commit(History.init(sample), (document) =>
      Doc.moveNode(document, "e3", { x: 0, y: 0 }),
    );
    const panned = History.amend(moved, (document) =>
      Doc.setExpanded(Doc.setViewport(document, { pan: { x: 9, y: 9 }, zoom: 2 }), "e3", true),
    );
    const undone = Option.getOrThrow(History.undo(panned));
    expect(undone.present.layout.nodes["e3"]).toEqual({
      position: { x: 980, y: 140 },
      isExpanded: true,
    });
    expect(undone.present.layout.viewport.zoom).toBe(2);
    const redone = Option.getOrThrow(History.redo(undone));
    expect(redone.present.layout.nodes["e3"]?.position).toEqual({ x: 0, y: 0 });
  });

  test("undo and redo at the ends of history do nothing", () => {
    expect(History.undo(History.init(sample))).toEqual(Option.none());
    expect(History.redo(History.init(sample))).toEqual(Option.none());
  });
});

describe("diagnostics", () => {
  test("the sample document is clean", () => {
    expect(Diagnostics.diagnose(sample)).toEqual([]);
  });

  test("flags duplicate entity and property names case-insensitively", () => {
    const document = Doc.renameEntity(
      Doc.replaceProperty(sample, "e1", {
        ...Doc.newProperty("p3", "EMAIL"),
      }),
      "e3",
      "post",
    );
    const tags = Diagnostics.diagnose(document).map((diagnostic) => diagnostic._tag);
    expect(tags.filter((tag) => tag === "DuplicateEntityName")).toHaveLength(2);
    expect(tags.filter((tag) => tag === "DuplicatePropertyName")).toHaveLength(2);
  });

  test("flags dangling entity references", () => {
    const document: DomainModelDocument = {
      ...sample,
      relationships: [
        { id: "r9", sourceEntityId: "e1", targetEntityId: "missing", cardinality: "1:1" },
      ],
    };
    expect(Diagnostics.diagnose(document)).toEqual([
      Diagnostics.Diagnostic.DanglingEntityReference({
        relationshipId: "r9",
        end: "Target",
        entityId: "missing",
      }),
    ]);
  });
});

describe("geometry", () => {
  test("zoomAround keeps the world point under the cursor fixed", () => {
    const viewport = { pan: { x: 40, y: -20 }, zoom: 1 };
    const focus = { x: 300, y: 200 };
    const before = Geometry.screenToWorld(viewport, focus);
    const zoomed = Geometry.zoomAround(viewport, focus, 2.5);
    expect(Geometry.screenToWorld(zoomed, focus)).toEqual(before);
    expect(zoomed.zoom).toBe(2.5);
  });

  test("zoom is clamped", () => {
    const viewport = { pan: { x: 0, y: 0 }, zoom: 1 };
    expect(Geometry.zoomAround(viewport, { x: 0, y: 0 }, 100).zoom).toBe(Geometry.MAX_ZOOM);
    expect(Geometry.zoomAround(viewport, { x: 0, y: 0 }, 0).zoom).toBe(Geometry.MIN_ZOOM);
  });

  test("classifyWheel separates pinch and wheel zoom from trackpad pans", () => {
    const base = { ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 0 };
    expect(Geometry.classifyWheel({ ...base, ctrlKey: true, deltaY: 3.2 })).toBe("Zoom");
    expect(Geometry.classifyWheel({ ...base, deltaY: 100 })).toBe("Zoom");
    expect(Geometry.classifyWheel({ ...base, deltaMode: 1, deltaY: 3 })).toBe("Zoom");
    expect(Geometry.classifyWheel({ ...base, deltaY: 4.5 })).toBe("Pan");
    expect(Geometry.classifyWheel({ ...base, deltaX: 12, deltaY: 100 })).toBe("Pan");
  });

  test("fitViewport centers the bounds without zooming past 100%", () => {
    const fitted = Geometry.fitViewport(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 1000, height: 800 },
    );
    expect(fitted).toEqual({ zoom: 1, pan: { x: 450, y: 350 } });
  });

  test("the Bézier router's midpoint lies on the curve between facing ports", () => {
    const source = { x: 0, y: 0 };
    const target = { x: 200, y: 100 };
    expect(bezierRouter.computeMidpoint(source, target)).toEqual({ x: 100, y: 50 });
    expect(bezierRouter.computePath(source, target, "right", "left")).toBe(
      "M 0.0 0.0 C 100.0 0.0, 100.0 100.0, 200.0 100.0",
    );
  });
});
