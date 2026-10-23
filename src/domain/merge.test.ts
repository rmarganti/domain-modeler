import { describe, expect, test } from "vitest";

import { Conflict, ConflictSubject, merge } from "./merge";
import type {
  AssociationDefinition,
  AttributeDefinition,
  DomainModelDocument,
  EntityDefinition,
  EnumDefinition,
} from "./schema";

// A self-contained fixture, so the tests don't depend on how the editor
// allocates IDs. IDs are opaque to merge, so some are deliberately random.

const attribute = (
  id: string,
  name: string,
  rest: Partial<AttributeDefinition> = {},
): AttributeDefinition => ({
  id,
  name,
  type: "String",
  multiplicity: { min: 1, max: "one" },
  unique: false,
  ...rest,
});

const base: DomainModelDocument = {
  version: "1.0.0",
  name: "Blog",
  entities: [
    {
      id: "e1",
      name: "User",
      attributes: [
        attribute("p1", "email", { unique: true }),
        attribute("p2", "name"),
        attribute("p3", "role", { type: { typeId: "t1" } }),
      ],
    },
    { id: "e2", name: "Post", attributes: [attribute("p4", "title")] },
    { id: "Qm7xK2pLw9", name: "Comment", attributes: [attribute("p5", "body")] },
  ],
  types: [
    {
      id: "t1",
      kind: "Enum",
      name: "Role",
      values: [
        { id: "v1", name: "admin" },
        { id: "v2", name: "member" },
      ],
    },
  ],
  associations: [
    {
      id: "r1",
      ends: [
        { entityId: "e1", multiplicity: { min: 1, max: "one" } },
        { entityId: "e2", multiplicity: { min: 0, max: "many" } },
      ],
    },
  ],
  layout: {
    nodes: {
      e1: { position: { x: 0, y: 0 }, isExpanded: true },
      e2: { position: { x: 300, y: 0 }, isExpanded: true },
      Qm7xK2pLw9: { position: { x: 600, y: 0 }, isExpanded: false },
      t1: { position: { x: 0, y: 300 }, isExpanded: true },
    },
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  },
};

// EDIT HELPERS

const mapEntity = (
  document: DomainModelDocument,
  entityId: string,
  f: (entity: EntityDefinition) => EntityDefinition,
): DomainModelDocument => ({
  ...document,
  entities: document.entities.map((entity) => (entity.id === entityId ? f(entity) : entity)),
});

const mapAttributes = (
  document: DomainModelDocument,
  entityId: string,
  f: (attributes: ReadonlyArray<AttributeDefinition>) => ReadonlyArray<AttributeDefinition>,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({ ...entity, attributes: f(entity.attributes) }));

const mapAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attributeId: string,
  f: (attribute: AttributeDefinition) => AttributeDefinition,
): DomainModelDocument =>
  mapAttributes(document, entityId, (attributes) =>
    attributes.map((existing) => (existing.id === attributeId ? f(existing) : existing)),
  );

const removeAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attributeId: string,
): DomainModelDocument =>
  mapAttributes(document, entityId, (attributes) =>
    attributes.filter((existing) => existing.id !== attributeId),
  );

const mapEnum = (
  document: DomainModelDocument,
  typeId: string,
  f: (definition: EnumDefinition) => EnumDefinition,
): DomainModelDocument => ({
  ...document,
  types: document.types.map((definition) =>
    definition.id === typeId ? f(definition) : definition,
  ),
});

const mapAssociation = (
  document: DomainModelDocument,
  associationId: string,
  f: (association: AssociationDefinition) => AssociationDefinition,
): DomainModelDocument => ({
  ...document,
  associations: document.associations.map((association) =>
    association.id === associationId ? f(association) : association,
  ),
});

const attributeIds = (document: DomainModelDocument, entityId: string): ReadonlyArray<string> =>
  document.entities.find((entity) => entity.id === entityId)?.attributes.map(({ id }) => id) ?? [];

const findAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attributeId: string,
): AttributeDefinition | undefined =>
  document.entities
    .find((entity) => entity.id === entityId)
    ?.attributes.find(({ id }) => id === attributeId);

const entityIds = (document: DomainModelDocument): ReadonlyArray<string> =>
  document.entities.map(({ id }) => id);

const withViewport = (document: DomainModelDocument, zoom: number): DomainModelDocument => ({
  ...document,
  layout: { ...document.layout, viewport: { pan: { x: zoom * 10, y: 0 }, zoom } },
});

describe("merge fast paths", () => {
  test("theirs unchanged returns ours untouched", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" }));
    const result = merge(base, ours, base);
    expect(result.document).toBe(ours);
    expect(result.conflicts).toEqual([]);
  });

  test("ours unchanged returns theirs with our viewport", () => {
    const ours = withViewport(base, 2);
    const theirs = withViewport(
      mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" })),
      3,
    );
    // Ours differs from base only in viewport, so it is not the fast path;
    // check the pure fast path separately below.
    expect(merge(base, ours, theirs).document).toEqual({
      ...theirs,
      layout: { ...theirs.layout, viewport: ours.layout.viewport },
    });
    const pure = merge(base, base, theirs);
    expect(pure.document).toEqual({
      ...theirs,
      layout: { ...theirs.layout, viewport: base.layout.viewport },
    });
    expect(pure.conflicts).toEqual([]);
  });
});

describe("merge attributes", () => {
  test("theirs deletes an attribute you didn't touch: it's deleted", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, unique: false }));
    const theirs = removeAttribute(base, "e1", "p2");
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p1", "p3"]);
    expect(findAttribute(result.document, "e1", "p1")?.unique).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  test("theirs deletes an attribute you renamed: yours is kept, with a conflict", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" }));
    const theirs = removeAttribute(base, "e1", "p1");
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p1", "p2", "p3"]);
    expect(findAttribute(result.document, "e1", "p1")?.name).toBe("emailAddress");
    expect(result.conflicts).toEqual([
      Conflict.DeletedInTheirs({
        subject: ConflictSubject.Attribute({ entityId: "e1", attributeId: "p1" }),
        label: "User.emailAddress",
      }),
    ]);
  });

  test("you delete an attribute theirs changed: it stays deleted, with a conflict", () => {
    const ours = removeAttribute(base, "e1", "p2");
    const theirs = mapAttribute(base, "e1", "p2", (p) => ({ ...p, name: "fullName" }));
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p1", "p3"]);
    expect(result.conflicts).toEqual([
      Conflict.DeletedInOurs({
        subject: ConflictSubject.Attribute({ entityId: "e1", attributeId: "p2" }),
        label: "User.fullName",
      }),
    ]);
  });

  test("both delete the same attribute: deleted", () => {
    const ours = removeAttribute(base, "e1", "p2");
    const theirs = removeAttribute(
      mapEntity(base, "e2", (e) => ({ ...e, name: "Article" })),
      "e1",
      "p2",
    );
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p1", "p3"]);
    expect(result.conflicts).toEqual([]);
  });

  test("you rename and theirs retypes the same attribute: both apply", () => {
    const ours = mapAttribute(base, "e1", "p2", (p) => ({ ...p, name: "fullName" }));
    const theirs = mapAttribute(base, "e1", "p2", (p) => ({
      ...p,
      type: "Json",
      multiplicity: { min: 0, max: "one" },
    }));
    const result = merge(base, ours, theirs);
    expect(findAttribute(result.document, "e1", "p2")).toEqual({
      id: "p2",
      name: "fullName",
      type: "Json",
      multiplicity: { min: 0, max: "one" },
      unique: false,
    });
    expect(result.conflicts).toEqual([]);
  });

  test("both rename differently: yours wins, with a conflict", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" }));
    const theirs = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "mail" }));
    const result = merge(base, ours, theirs);
    expect(findAttribute(result.document, "e1", "p1")?.name).toBe("emailAddress");
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.Attribute({ entityId: "e1", attributeId: "p1" }),
        property: "name",
        label: "User.emailAddress",
      }),
    ]);
  });

  test("both make the same change: no conflict", () => {
    const edit = (document: DomainModelDocument) =>
      mapAttribute(document, "e1", "p2", (p) => ({ ...p, type: { typeId: "t1" } }));
    const result = merge(base, edit(base), edit(base));
    expect(findAttribute(result.document, "e1", "p2")?.type).toEqual({ typeId: "t1" });
    expect(result.conflicts).toEqual([]);
  });

  test("an absent optional property is a value of its own", () => {
    const described = mapAttribute(base, "e1", "p1", (p) => ({ ...p, description: "Login" }));
    // Theirs adds a description you never touched.
    const added = merge(
      base,
      mapAttribute(base, "e1", "p2", (p) => ({ ...p, unique: true })),
      described,
    );
    expect(findAttribute(added.document, "e1", "p1")?.description).toBe("Login");
    // You remove a description theirs never touched.
    const { description: _, ...withoutDescription } = findAttribute(described, "e1", "p1")!;
    const removed = merge(
      described,
      mapAttribute(described, "e1", "p1", () => withoutDescription),
      mapAttribute(described, "e1", "p2", (p) => ({ ...p, unique: true })),
    );
    expect(findAttribute(removed.document, "e1", "p1")).not.toHaveProperty("description");
    expect(removed.conflicts).toEqual([]);
  });

  test("both add attributes to the same entity: both are kept", () => {
    const ours = mapAttributes(base, "e1", (attributes) => [
      ...attributes,
      attribute("aOurs", "bio"),
    ]);
    const theirs = mapAttributes(base, "e1", (attributes) => [
      attribute("aTheirs", "handle"),
      ...attributes,
    ]);
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["aTheirs", "p1", "p2", "p3", "aOurs"]);
    expect(result.conflicts).toEqual([]);
  });

  test("you reorder attributes while theirs adds one: your order, theirs' addition after its neighbour", () => {
    const ours = mapAttributes(base, "e1", ([p1, p2, p3]) => [p3!, p1!, p2!]);
    const theirs = mapAttributes(base, "e1", ([p1, p2, p3]) => [
      p1!,
      attribute("p9", "age"),
      p2!,
      p3!,
    ]);
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p3", "p1", "p9", "p2"]);
  });

  test("theirs reorders attributes while you add one: their order, your addition after its neighbour", () => {
    const ours = mapAttributes(base, "e1", ([p1, p2, p3]) => [
      p1!,
      p2!,
      attribute("p9", "age"),
      p3!,
    ]);
    const theirs = mapAttributes(base, "e1", ([p1, p2, p3]) => [p3!, p2!, p1!]);
    const result = merge(base, ours, theirs);
    expect(attributeIds(result.document, "e1")).toEqual(["p3", "p2", "p9", "p1"]);
  });

  test("the same new ID added on both sides merges against an empty base", () => {
    const add = (name: string) => (document: DomainModelDocument) =>
      mapAttributes(document, "e2", (attributes) => [...attributes, attribute("x8Hq2LmP0z", name)]);
    const same = merge(base, add("slug")(base), add("slug")(base));
    expect(attributeIds(same.document, "e2")).toEqual(["p4", "x8Hq2LmP0z"]);
    expect(same.conflicts).toEqual([]);

    const different = merge(base, add("slug")(base), add("permalink")(base));
    expect(findAttribute(different.document, "e2", "x8Hq2LmP0z")?.name).toBe("slug");
    expect(different.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.Attribute({ entityId: "e2", attributeId: "x8Hq2LmP0z" }),
        property: "name",
        label: "Post.slug",
      }),
    ]);
  });
});

describe("merge entities", () => {
  test("theirs adds an entity: it appears in theirs' position", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" }));
    const tag: EntityDefinition = { id: "e9", name: "Tag", attributes: [attribute("p9", "label")] };
    const theirs: DomainModelDocument = {
      ...base,
      entities: [base.entities[0]!, tag, ...base.entities.slice(1)],
    };
    const result = merge(base, ours, theirs);
    expect(entityIds(result.document)).toEqual(["e1", "e9", "e2", "Qm7xK2pLw9"]);
    expect(result.document.entities[1]).toEqual(tag);
    expect(result.conflicts).toEqual([]);
  });

  test("an item whose neighbours are all gone goes to the start", () => {
    const ours: DomainModelDocument = {
      ...base,
      entities: [...base.entities, { id: "e9", name: "Tag", attributes: [] }],
    };
    const theirs: DomainModelDocument = { ...base, entities: [] };
    expect(entityIds(merge(base, ours, theirs).document)).toEqual(["e9"]);
  });

  test("theirs reorders entities: their order wins", () => {
    const ours = mapAttribute(base, "e1", "p1", (p) => ({ ...p, name: "emailAddress" }));
    const theirs: DomainModelDocument = { ...base, entities: [...base.entities].reverse() };
    expect(entityIds(merge(base, ours, theirs).document)).toEqual(["Qm7xK2pLw9", "e2", "e1"]);
  });

  test("theirs deletes an entity whose attribute you changed: kept, with a conflict", () => {
    const ours = mapAttribute(base, "e2", "p4", (p) => ({ ...p, name: "headline" }));
    const theirs: DomainModelDocument = {
      ...base,
      entities: base.entities.filter(({ id }) => id !== "e2"),
    };
    const result = merge(base, ours, theirs);
    expect(entityIds(result.document)).toEqual(["e1", "e2", "Qm7xK2pLw9"]);
    expect(result.conflicts).toEqual([
      Conflict.DeletedInTheirs({
        subject: ConflictSubject.Entity({ entityId: "e2" }),
        label: "Post",
      }),
    ]);
  });

  test("both change an entity's description: yours wins, labelled by entity", () => {
    const describe = (description: string) => (document: DomainModelDocument) =>
      mapEntity(document, "e1", (entity) => ({ ...entity, description }));
    const result = merge(base, describe("Ours")(base), describe("Theirs")(base));
    expect(result.document.entities[0]?.description).toBe("Ours");
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.Entity({ entityId: "e1" }),
        property: "description",
        label: "User",
      }),
    ]);
  });

  test("theirs deletes an enum you didn't touch that your new attribute references", () => {
    const ours = mapAttributes(base, "e2", (attributes) => [
      ...attributes,
      attribute("p9", "status", { type: { typeId: "t1" } }),
    ]);
    // Theirs drops the enum and retypes the only attribute that used it.
    const theirs: DomainModelDocument = {
      ...mapAttribute(base, "e1", "p3", (p) => ({ ...p, type: "String" })),
      types: [],
    };
    const result = merge(base, ours, theirs);
    expect(result.document.types).toEqual([]);
    expect(findAttribute(result.document, "e2", "p9")?.type).toEqual({ typeId: "t1" });
    expect(findAttribute(result.document, "e1", "p3")?.type).toBe("String");
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge enums", () => {
  test("enum values merge per ID and conflicts are labelled Enum.value", () => {
    const ours = mapEnum(base, "t1", (definition) => ({
      ...definition,
      values: [{ id: "v1", name: "owner" }, definition.values[1]!, { id: "v3", name: "guest" }],
    }));
    const theirs = mapEnum(base, "t1", (definition) => ({
      ...definition,
      description: "Access level",
      values: [{ id: "v1", name: "administrator" }, definition.values[1]!],
    }));
    const result = merge(base, ours, theirs);
    expect(result.document.types).toEqual([
      {
        id: "t1",
        kind: "Enum",
        name: "Role",
        description: "Access level",
        values: [
          { id: "v1", name: "owner" },
          { id: "v2", name: "member" },
          { id: "v3", name: "guest" },
        ],
      },
    ]);
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.EnumValue({ typeId: "t1", valueId: "v1" }),
        property: "name",
        label: "Role.owner",
      }),
    ]);
  });
});

describe("merge associations", () => {
  test("ends merge index by index, property by property", () => {
    const ours = mapAssociation(base, "r1", (association) => ({
      ...association,
      ends: [{ ...association.ends[0], multiplicity: { min: 0, max: "one" } }, association.ends[1]],
    }));
    const theirs = mapAssociation(base, "r1", (association) => ({
      ...association,
      name: "writes",
      ends: [association.ends[0], { ...association.ends[1], role: "articles" }],
    }));
    const result = merge(base, ours, theirs);
    expect(result.document.associations).toEqual([
      {
        id: "r1",
        name: "writes",
        ends: [
          { entityId: "e1", multiplicity: { min: 0, max: "one" } },
          { entityId: "e2", role: "articles", multiplicity: { min: 0, max: "many" } },
        ],
      },
    ]);
    expect(result.conflicts).toEqual([]);
  });

  test("both change an end's role: yours wins, labelled User–Post", () => {
    const role = (name: string) => (document: DomainModelDocument) =>
      mapAssociation(document, "r1", (association) => ({
        ...association,
        ends: [association.ends[0], { ...association.ends[1], role: name }],
      }));
    const result = merge(base, role("posts")(base), role("articles")(base));
    expect(result.document.associations[0]?.ends[1].role).toBe("posts");
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.AssociationEnd({ associationId: "r1", endIndex: 1 }),
        property: "role",
        label: "User–Post",
      }),
    ]);
  });

  test("you delete an association theirs renamed: it stays deleted, with a conflict", () => {
    const ours: DomainModelDocument = { ...base, associations: [] };
    const theirs = mapAssociation(base, "r1", (association) => ({
      ...association,
      name: "writes",
    }));
    const result = merge(base, ours, theirs);
    expect(result.document.associations).toEqual([]);
    expect(result.conflicts).toEqual([
      Conflict.DeletedInOurs({
        subject: ConflictSubject.Association({ associationId: "r1" }),
        label: "User–Post",
      }),
    ]);
  });
});

describe("merge document and layout", () => {
  test("both rename the document: yours wins", () => {
    const result = merge(base, { ...base, name: "Ours" }, { ...base, name: "Theirs" });
    expect(result.document.name).toBe("Ours");
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.Document(),
        property: "name",
        label: "Ours",
      }),
    ]);
  });

  test("the viewport is always yours", () => {
    const ours = withViewport(
      mapEntity(base, "e1", (e) => ({ ...e, name: "Account" })),
      2,
    );
    const theirs = withViewport(
      mapEntity(base, "e2", (e) => ({ ...e, name: "Article" })),
      3,
    );
    const result = merge(base, ours, theirs);
    expect(result.document.layout.viewport).toEqual(ours.layout.viewport);
    expect(entityIds(result.document)).toEqual(["e1", "e2", "Qm7xK2pLw9"]);
    expect(result.document.entities.map(({ name }) => name)).toEqual([
      "Account",
      "Article",
      "Comment",
    ]);
    expect(result.conflicts).toEqual([]);
  });

  test("layout nodes merge per key", () => {
    const node = (document: DomainModelDocument, id: string, x: number, isExpanded: boolean) => ({
      ...document,
      layout: {
        ...document.layout,
        nodes: { ...document.layout.nodes, [id]: { position: { x, y: 0 }, isExpanded } },
      },
    });
    const ours = node(node(base, "e1", 50, false), "e2", 1000, true);
    const theirs = node(node(base, "e1", 0, true), "e2", 2000, true);
    const result = merge(base, ours, theirs);
    expect(result.document.layout.nodes["e1"]).toEqual({
      position: { x: 50, y: 0 },
      isExpanded: false,
    });
    expect(result.document.layout.nodes["e2"]).toEqual({
      position: { x: 1000, y: 0 },
      isExpanded: true,
    });
    expect(result.conflicts).toEqual([
      Conflict.BothChanged({
        subject: ConflictSubject.Node({ nodeId: "e2" }),
        property: "position",
        label: "Post",
      }),
    ]);
  });

  test("a card that survives a deletion in theirs keeps its node", () => {
    const ours = mapAttribute(base, "e2", "p4", (p) => ({ ...p, name: "headline" }));
    const { e2: _, ...withoutE2 } = base.layout.nodes;
    const theirs: DomainModelDocument = {
      ...base,
      entities: base.entities.filter(({ id }) => id !== "e2"),
      layout: { ...base.layout, nodes: withoutE2 },
    };
    const result = merge(base, ours, theirs);
    expect(result.document.layout.nodes["e2"]).toEqual(base.layout.nodes["e2"]);
  });

  test("moving a card theirs deleted reports no conflict of its own", () => {
    const { e2: node, ...withoutE2 } = base.layout.nodes;
    const ours: DomainModelDocument = {
      ...base,
      layout: {
        ...base.layout,
        nodes: { ...withoutE2, e2: { ...node!, position: { x: 999, y: 0 } } },
      },
    };
    const theirs: DomainModelDocument = {
      ...base,
      entities: base.entities.filter(({ id }) => id !== "e2"),
      associations: [],
      layout: { ...base.layout, nodes: withoutE2 },
    };
    const result = merge(base, ours, theirs);
    expect(entityIds(result.document)).toEqual(["e1", "Qm7xK2pLw9"]);
    expect(result.conflicts).toEqual([]);
  });

  test("a node added on one side appears, and a card still present keeps its node", () => {
    const { t1: _, ...withoutT1 } = base.layout.nodes;
    const theirs: DomainModelDocument = {
      ...base,
      layout: {
        ...base.layout,
        nodes: { ...withoutT1, e9: { position: { x: 9, y: 9 }, isExpanded: true } },
      },
    };
    const result = merge(base, withViewport(base, 2), theirs);
    expect(Object.keys(result.document.layout.nodes).sort()).toEqual([
      "Qm7xK2pLw9",
      "e1",
      "e2",
      "e9",
      "t1",
    ]);
  });
});
