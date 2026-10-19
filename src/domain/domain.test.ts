import { Option, Schema } from "effect";
import { describe, expect, test } from "vitest";

import * as Diagnostics from "./diagnostics";
import * as Doc from "./document";
import { bezierRouter } from "./edgeRouter";
import * as Geometry from "./geometry";
import * as History from "./history";
import { defaultRole, enumNameForAttribute, toPascalCase } from "./naming";
import {
  DomainModelDocumentJsonString,
  type AssociationDefinition,
  type DomainModelDocument,
} from "./schema";

const sample = Doc.sampleDocument;

describe("document", () => {
  test("nextId never collides with existing ids", () => {
    expect(Doc.nextId(sample, "e")).toBe("e4");
    expect(Doc.nextId(sample, "p")).toBe("p11");
    expect(Doc.nextId(sample, "r")).toBe("r3");
    expect(Doc.nextId(sample, "t")).toBe("t2");
    expect(Doc.nextId(sample, "v")).toBe("v4");
    expect(Doc.nextId(Doc.emptyDocument("x"), "e")).toBe("e1");
    expect(Doc.nextId(Doc.emptyDocument("x"), "t")).toBe("t1");
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
    expect(Object.keys(synced.layout.nodes).sort()).toEqual(["e1", "e2", "e3", "t1"]);
    // e1 occupies the first stagger slot, so e2, e3, and t1 take the next ones.
    expect(synced.layout.nodes["e2"]?.position).toEqual({ x: 340, y: 80 });
    expect(synced.layout.nodes["e3"]?.position).toEqual({ x: 600, y: 80 });
    expect(synced.layout.nodes["t1"]?.position).toEqual({ x: 860, y: 80 });
  });

  test("syncLayout prunes the node of a type that no longer exists", () => {
    const synced = Doc.syncLayout({ ...sample, types: [] });
    expect(Object.keys(synced.layout.nodes).sort()).toEqual(["e1", "e2", "e3"]);
  });

  test("deleteEntity cascades to its associations and layout node", () => {
    const next = Doc.deleteEntity(sample, "e2");
    expect(next.entities.map((entity) => entity.id)).toEqual(["e1", "e3"]);
    expect(next.associations).toEqual([]);
    expect(next.layout.nodes["e2"]).toBeUndefined();
  });

  test("deleteAttribute removes the field and leaves associations alone", () => {
    const next = Doc.deleteAttribute(sample, "e1", "p3");
    expect(Option.getOrThrow(Doc.findEntity(next, "e1")).attributes.map((p) => p.id)).toEqual([
      "p2",
      "p4",
    ]);
    expect(next.associations).toEqual(sample.associations);
  });

  test("a new attribute is a single, non-unique String", () => {
    expect(Doc.newAttribute("p1", "name")).toEqual({
      id: "p1",
      name: "name",
      type: "String",
      multiplicity: { min: 1, max: "one" },
      unique: false,
    });
  });

  test("a list attribute can't be stored as unique", () => {
    const list = { min: 0, max: "many" } as const;
    const tags = { ...Doc.newAttribute("p99", "tags"), multiplicity: list, unique: true };
    const added = Doc.addAttribute(sample, "e3", tags);
    expect(Option.getOrThrow(Doc.findEntity(added, "e3")).attributes.at(-1)?.unique).toBe(false);
    const email = Option.getOrThrow(
      Doc.findAttribute(Option.getOrThrow(Doc.findEntity(sample, "e1")), "p2"),
    );
    const replaced = Doc.replaceAttribute(sample, "e1", { ...email, multiplicity: list });
    expect(
      Option.getOrThrow(Doc.findEntity(replaced, "e1")).attributes.find((a) => a.id === "p2")
        ?.unique,
    ).toBe(false);
  });

  test("moveAttribute swaps with its neighbor and ignores out of range moves", () => {
    const moved = Doc.moveAttribute(sample, "e1", "p3", "Up");
    expect(Option.getOrThrow(Doc.findEntity(moved, "e1")).attributes.map((p) => p.id)).toEqual([
      "p3",
      "p2",
      "p4",
    ]);
    expect(Doc.moveAttribute(sample, "e1", "p2", "Up")).toEqual(sample);
  });

  test("addEnum places a collapsed, empty enum clear of existing cards", () => {
    const next = Doc.addEnum(sample, "t2", "Status", { x: 120, y: 520 });
    expect(Option.getOrThrow(Doc.findEnum(next, "t2"))).toEqual({
      id: "t2",
      kind: "Enum",
      name: "Status",
      values: [],
    });
    const node = next.layout.nodes["t2"];
    expect(node?.isExpanded).toBe(false);
    // The Role card already sits at the requested spot.
    expect(node?.position).not.toEqual({ x: 120, y: 520 });
  });

  test("addEntity avoids enum cards too", () => {
    const next = Doc.addEntity(sample, "e4", "Comment", { x: 120, y: 520 });
    expect(next.layout.nodes["e4"]?.position).not.toEqual({ x: 120, y: 520 });
  });

  test("renameEnum and deleteEnum, which removes its layout node", () => {
    const renamed = Doc.renameEnum(sample, "t1", "Permission");
    expect(Option.getOrThrow(Doc.findEnum(renamed, "t1")).name).toBe("Permission");
    const deleted = Doc.deleteEnum(sample, "t1");
    expect(deleted.types).toEqual([]);
    expect(deleted.layout.nodes["t1"]).toBeUndefined();
    expect(deleted.entities).toEqual(sample.entities);
  });

  test("enum value operations", () => {
    const values = (document: DomainModelDocument) =>
      Option.getOrThrow(Doc.findEnum(document, "t1")).values;
    const added = Doc.addEnumValue(sample, "t1", { id: "v4", name: "guest" });
    expect(values(added).map((value) => value.name)).toEqual([
      "reader",
      "author",
      "admin",
      "guest",
    ]);
    const described = Doc.updateEnumValue(added, "t1", "v4", "visitor", "  Not signed in ");
    expect(values(described).at(-1)).toEqual({
      id: "v4",
      name: "visitor",
      description: "Not signed in",
    });
    const cleared = Doc.updateEnumValue(described, "t1", "v4", "visitor", " ");
    expect(values(cleared).at(-1)).toEqual({ id: "v4", name: "visitor" });
    const moved = Doc.moveEnumValue(cleared, "t1", "v4", "Up");
    expect(values(moved).map((value) => value.id)).toEqual(["v1", "v2", "v4", "v3"]);
    expect(Doc.moveEnumValue(moved, "t1", "v1", "Up")).toEqual(moved);
    const deleted = Doc.deleteEnumValue(moved, "t1", "v2");
    expect(values(deleted).map((value) => value.id)).toEqual(["v1", "v4", "v3"]);
  });

  test("newAssociation defaults to one from per many tos", () => {
    expect(Doc.newAssociation("r9", "e1", "e3").ends).toEqual([
      { entityId: "e1", multiplicity: { min: 1, max: "one" } },
      { entityId: "e3", multiplicity: { min: 0, max: "many" } },
    ]);
  });

  test("setEndMultiplicity changes only the chosen end", () => {
    const next = Doc.setEndMultiplicity(sample, "r1", 0, { min: 0, max: "one" });
    expect(Option.getOrThrow(Doc.findAssociation(next, "r1")).ends).toEqual([
      { entityId: "e1", multiplicity: { min: 0, max: "one" } },
      { entityId: "e2", multiplicity: { min: 0, max: "many" } },
    ]);
  });

  test("setEndRole trims the role and a blank role removes the key", () => {
    const named = Doc.setEndRole(sample, "r1", 1, "  articles ");
    expect(Option.getOrThrow(Doc.findAssociation(named, "r1")).ends[1]).toEqual({
      entityId: "e2",
      role: "articles",
      multiplicity: { min: 0, max: "many" },
    });
    const cleared = Doc.setEndRole(named, "r1", 1, "  ");
    expect(Object.keys(Option.getOrThrow(Doc.findAssociation(cleared, "r1")).ends[1])).toEqual([
      "entityId",
      "multiplicity",
    ]);
  });

  test("setAssociationDescription stores text and a blank one removes the key", () => {
    const described = Doc.setAssociationDescription(sample, "r1", "Authorship");
    expect(Option.getOrThrow(Doc.findAssociation(described, "r1")).description).toBe("Authorship");
    const cleared = Doc.setAssociationDescription(described, "r1", "");
    expect("description" in Option.getOrThrow(Doc.findAssociation(cleared, "r1"))).toBe(false);
  });

  test("addEntity avoids overlapping existing nodes", () => {
    const next = Doc.addEntity(sample, "e4", "Comment", { x: 120, y: 140 });
    const position = next.layout.nodes["e4"]?.position;
    expect(position).toBeDefined();
    expect(position).not.toEqual({ x: 120, y: 140 });
  });

  test("the document codec round-trips, enums included", () => {
    const json = Schema.encodeSync(DomainModelDocumentJsonString)(sample);
    expect(JSON.parse(json).types[0]).toMatchObject({ id: "t1", kind: "Enum", name: "Role" });
    expect(Schema.decodeUnknownSync(DomainModelDocumentJsonString)(json)).toEqual(sample);
  });

  test("the codec accepts an enum reference and rejects the removed Literal type", () => {
    const withType = (type: unknown) =>
      JSON.stringify({
        ...JSON.parse(Schema.encodeSync(DomainModelDocumentJsonString)(sample)),
        entities: [
          {
            id: "e1",
            name: "User",
            attributes: [
              {
                id: "p1",
                name: "role",
                type,
                multiplicity: { min: 1, max: "one" },
                unique: false,
              },
            ],
          },
        ],
      });
    const decode = Schema.decodeUnknownSync(DomainModelDocumentJsonString);
    expect(decode(withType({ typeId: "t1" })).entities[0]?.attributes[0]?.type).toEqual({
      typeId: "t1",
    });
    expect(() => decode(withType(`Literal`))).toThrow();
  });

  test("attributeTypeLabel names primitives, enums, and dangling references", () => {
    expect(Doc.attributeTypeLabel(sample, "DateTime")).toBe("DateTime");
    expect(Doc.attributeTypeLabel(sample, { typeId: "t1" })).toBe("Role");
    expect(Doc.attributeTypeLabel(sample, { typeId: "t9" })).toBe("?");
  });

  test("addEnumForAttribute creates an expanded enum beside the entity and types the field", () => {
    const status = { ...Doc.newAttribute("p11", "status"), unique: true };
    const document = Doc.addEnumForAttribute(
      Doc.addAttribute(sample, "e2", Doc.newAttribute("p11", "field3")),
      "e2",
      status,
      "t2",
      "v4",
      "Status",
    );
    expect(Option.getOrThrow(Doc.findEnum(document, "t2"))).toEqual({
      id: "t2",
      kind: "Enum",
      name: "Status",
      values: [{ id: "v4", name: "" }],
    });
    const post = Option.getOrThrow(Doc.findEntity(document, "e2"));
    expect(post.attributes.at(-1)).toEqual({ ...status, type: { typeId: "t2" } });
    const node = document.layout.nodes["t2"];
    expect(node?.isExpanded).toBe(true);
    // Post is expanded at x 560, so the card starts right of its 300px width.
    expect(node?.position.x).toBeGreaterThanOrEqual(560 + Geometry.EXPANDED_NODE_WIDTH);
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

describe("naming", () => {
  const one = { min: 1, max: "one" } as const;
  const many = { min: 0, max: "many" } as const;

  test("defaultRole camel-cases the entity name and pluralizes for many", () => {
    expect(defaultRole("Person", many)).toBe("people");
    expect(defaultRole("Category", many)).toBe("categories");
    expect(defaultRole("Status", many)).toBe("statuses");
    expect(defaultRole("Line Item", one)).toBe("lineItem");
    expect(defaultRole("Line Item", many)).toBe("lineItems");
    expect(defaultRole("User", one)).toBe("user");
  });
});

describe("naming enums", () => {
  test("toPascalCase and the enum name for a field", () => {
    expect(toPascalCase("order status")).toBe("OrderStatus");
    expect(toPascalCase("displayName")).toBe("DisplayName");
    expect(enumNameForAttribute("role")).toBe("Role");
    expect(enumNameForAttribute("order status")).toBe("OrderStatus");
    expect(enumNameForAttribute("  ")).toBe("NewEnum");
  });
});

describe("diagnostics", () => {
  test("deleting an enum leaves its fields dangling until undo", () => {
    const history = History.commit(History.init(sample), (document) =>
      Doc.deleteEnum(document, "t1"),
    );
    const diagnostics = Diagnostics.diagnose(history.present);
    expect(diagnostics).toEqual([
      Diagnostics.Diagnostic.DanglingTypeReference({
        entityId: "e1",
        attributeId: "p4",
        typeId: "t1",
      }),
    ]);
    expect(Diagnostics.forAttribute(diagnostics, "p4")).toHaveLength(1);
    expect(Diagnostics.forEntity(diagnostics, "e1")).toHaveLength(1);
    expect(Diagnostics.describe(diagnostics[0]!)).toBe("Enum “t1” does not exist");
    const undone = Option.getOrThrow(History.undo(history));
    expect(Diagnostics.diagnose(undone.present)).toEqual([]);
  });

  test("an enum-typed field may be unique", () => {
    const document = Doc.replaceAttribute(sample, "e1", {
      ...Doc.newAttribute("p4", "role"),
      type: { typeId: "t1" },
      unique: true,
    });
    expect(Diagnostics.diagnose(document)).toEqual([]);
  });

  test("the sample document is clean", () => {
    expect(Diagnostics.diagnose(sample)).toEqual([]);
  });

  test("flags duplicate entity and attribute names case-insensitively", () => {
    const document = Doc.renameEntity(
      Doc.replaceAttribute(sample, "e1", {
        ...Doc.newAttribute("p3", "EMAIL"),
      }),
      "e3",
      "post",
    );
    const tags = Diagnostics.diagnose(document).map((diagnostic) => diagnostic._tag);
    expect(tags.filter((tag) => tag === "DuplicateTypeName")).toHaveLength(2);
    expect(tags.filter((tag) => tag === "DuplicateAttributeName")).toHaveLength(2);
  });

  test("entities and enums share one namespace", () => {
    const document = Doc.addEntity(sample, "e4", "role", { x: 0, y: 600 });
    const diagnostics = Diagnostics.diagnose(document);
    expect(diagnostics).toEqual([
      Diagnostics.Diagnostic.DuplicateTypeName({ nodeId: "e4", name: "role" }),
      Diagnostics.Diagnostic.DuplicateTypeName({ nodeId: "t1", name: "Role" }),
    ]);
    expect(Diagnostics.forEntity(diagnostics, "e4")).toHaveLength(1);
    expect(Diagnostics.forEnum(diagnostics, "t1")).toHaveLength(1);
    expect(Diagnostics.describe(diagnostics[1]!)).toBe("Duplicate type name “Role”");
  });

  test("flags duplicate enum value names", () => {
    const document = Doc.addEnumValue(sample, "t1", { id: "v4", name: "Admin" });
    const diagnostics = Diagnostics.diagnose(document);
    expect(diagnostics).toEqual([
      Diagnostics.Diagnostic.DuplicateEnumValueName({ typeId: "t1", valueId: "v3", name: "admin" }),
      Diagnostics.Diagnostic.DuplicateEnumValueName({ typeId: "t1", valueId: "v4", name: "Admin" }),
    ]);
    expect(Diagnostics.forEnumValue(diagnostics, "v4")).toHaveLength(1);
    expect(Diagnostics.forEnum(diagnostics, "t1")).toHaveLength(2);
    expect(Diagnostics.describe(diagnostics[1]!)).toBe("Duplicate value name “Admin”");
  });

  test("flags an enum with no values", () => {
    const document = Doc.addEnum(sample, "t2", "Status", { x: 0, y: 600 });
    const diagnostics = Diagnostics.diagnose(document);
    expect(diagnostics).toEqual([Diagnostics.Diagnostic.EmptyEnum({ typeId: "t2" })]);
    expect(Diagnostics.forEnum(diagnostics, "t2")).toEqual(diagnostics);
    expect(diagnostics.map(Diagnostics.describe)).toEqual(["Enum has no values"]);
    expect(
      Diagnostics.diagnose(Doc.addEnumValue(document, "t2", { id: "v4", name: "draft" })),
    ).toEqual([]);
  });

  test("flags a unique list attribute in a loaded file", () => {
    const document: DomainModelDocument = {
      ...Doc.emptyDocument("Loaded"),
      entities: [
        {
          id: "e1",
          name: "Post",
          attributes: [
            {
              ...Doc.newAttribute("p1", "tags"),
              multiplicity: { min: 0, max: "many" },
              unique: true,
            },
          ],
        },
      ],
    };
    const diagnostics = Diagnostics.diagnose(document);
    expect(diagnostics).toEqual([
      Diagnostics.Diagnostic.UniqueOnList({ entityId: "e1", attributeId: "p1" }),
    ]);
    expect(Diagnostics.forAttribute(diagnostics, "p1")).toEqual(diagnostics);
    expect(diagnostics.map(Diagnostics.describe)).toEqual(["A list field can't be unique"]);
  });

  test("flags dangling entity references", () => {
    const document: DomainModelDocument = {
      ...sample,
      associations: [
        {
          id: "r9",
          ends: [
            { entityId: "e1", multiplicity: { min: 1, max: "one" } },
            { entityId: "missing", multiplicity: { min: 1, max: "one" } },
          ],
        },
      ],
    };
    const diagnostics = Diagnostics.diagnose(document);
    expect(diagnostics).toEqual([
      Diagnostics.Diagnostic.DanglingEntityReference({
        associationId: "r9",
        endIndex: 1,
        entityId: "missing",
      }),
    ]);
    expect(diagnostics.map(Diagnostics.describe)).toEqual([
      "Entity “missing” at end 2 does not exist",
    ]);
  });

  describe("role clashes", () => {
    // Each order has one address; an address serves many orders.
    const orderAddress = (id: string): AssociationDefinition => ({
      id,
      ends: [
        { entityId: "e1", multiplicity: { min: 0, max: "many" } },
        { entityId: "e2", multiplicity: { min: 1, max: "one" } },
      ],
    });
    const shop: DomainModelDocument = {
      ...Doc.emptyDocument("Shop"),
      entities: [
        { id: "e1", name: "Order", attributes: [] },
        { id: "e2", name: "Address", attributes: [] },
      ],
      associations: [orderAddress("r1"), orderAddress("r2")],
    };
    const clashes = (document: DomainModelDocument) =>
      Diagnostics.diagnose(document).filter((diagnostic) => diagnostic._tag === "RoleClash");
    const clashesOn = (document: DomainModelDocument, entityId: string) =>
      clashes(document).filter((clash) => clash.entityId === entityId);

    test("two unnamed associations to the same entity clash on it", () => {
      expect(clashesOn(shop, "e1")).toEqual([
        Diagnostics.Diagnostic.RoleClash({
          associationId: "r1",
          endIndex: 1,
          entityId: "e1",
          entityName: "Order",
          name: "address",
        }),
        Diagnostics.Diagnostic.RoleClash({
          associationId: "r2",
          endIndex: 1,
          entityId: "e1",
          entityName: "Order",
          name: "address",
        }),
      ]);
      expect(Diagnostics.describe(clashesOn(shop, "e1")[0]!)).toBe(
        "Role “address” clashes on Order",
      );
      expect(
        Diagnostics.forAssociation(Diagnostics.diagnose(shop), "r2").map((d) => d._tag),
      ).toEqual(["RoleClash", "RoleClash"]);
    });

    test("explicit roles resolve the clash", () => {
      const named = Doc.setEndRole(
        Doc.setEndRole(shop, "r1", 1, "billingAddress"),
        "r2",
        1,
        "shippingAddress",
      );
      expect(clashesOn(named, "e1")).toEqual([]);
      // Address still reaches both as `orders` until those ends get roles too.
      expect(clashesOn(named, "e2").map((clash) => clash.name)).toEqual(["orders", "orders"]);
    });

    test("a role clashes with an attribute of the same name", () => {
      const document = Doc.addAttribute(sample, "e1", Doc.newAttribute("p99", "Posts"));
      expect(clashes(document)).toEqual([
        Diagnostics.Diagnostic.RoleClash({
          associationId: "r1",
          endIndex: 1,
          entityId: "e1",
          entityName: "User",
          name: "posts",
        }),
      ]);
    });

    test("a self association gives the entity both roles", () => {
      const document: DomainModelDocument = {
        ...shop,
        associations: [
          {
            id: "r1",
            ends: [
              { entityId: "e1", multiplicity: { min: 0, max: "many" } },
              { entityId: "e1", multiplicity: { min: 0, max: "many" } },
            ],
          },
        ],
      };
      expect(clashes(document).map((clash) => clash.endIndex)).toEqual([0, 1]);
      expect(clashes(Doc.setEndRole(document, "r1", 0, "parents"))).toEqual([]);
    });
  });
});

describe("geometry", () => {
  test("enum cards size like entity cards, with values as rows", () => {
    const role = Option.getOrThrow(Doc.findEnum(sample, "t1"));
    const tag = Option.getOrThrow(Doc.findEntity(sample, "e3"));
    const collapsed = { position: { x: 0, y: 0 }, isExpanded: false };
    expect(Geometry.enumRect(role, collapsed, Option.none())).toEqual(
      Geometry.nodeRect(tag, collapsed, Option.none()),
    );
    const expanded = { ...collapsed, isExpanded: true };
    const rect = Geometry.enumRect(role, expanded, Option.none());
    expect(rect.width).toBe(Geometry.EXPANDED_NODE_WIDTH);
    expect(rect.height).toBe(
      Geometry.NODE_HEADER_HEIGHT + 3 * Geometry.ATTRIBUTE_ROW_HEIGHT + Geometry.NODE_FOOTER_HEIGHT,
    );
    expect(Geometry.enumRect(role, expanded, Option.some("v2")).height).toBe(
      rect.height + Geometry.ENUM_VALUE_EDITOR_HEIGHT - Geometry.ATTRIBUTE_ROW_HEIGHT,
    );
    // An editor open on another card doesn't grow this one.
    expect(Geometry.enumRect(role, expanded, Option.some("p2")).height).toBe(rect.height);
  });

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

  test("isRectOnScreen requires the navigation margin on every edge", () => {
    const viewport = { zoom: 2, pan: { x: 0, y: 0 } };
    const screen = { width: 1000, height: 800 };
    const margin = Geometry.NAVIGATION_MARGIN;
    const onScreen = (x: number, y: number, width: number, height: number) =>
      Geometry.isRectOnScreen(viewport, screen, {
        x: x / 2,
        y: y / 2,
        width: width / 2,
        height: height / 2,
      });
    expect(onScreen(margin, margin, 1000 - margin * 2, 800 - margin * 2)).toBe(true);
    expect(onScreen(margin - 1, 100, 100, 100)).toBe(false);
    expect(onScreen(100, margin - 1, 100, 100)).toBe(false);
    expect(onScreen(1000 - margin - 99, 100, 100, 100)).toBe(false);
    expect(onScreen(100, 800 - margin - 99, 100, 100)).toBe(false);
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
