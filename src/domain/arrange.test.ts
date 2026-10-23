import { describe, expect, test } from "vitest";

import { arrange } from "./arrange";
import * as Geometry from "./geometry";
import type {
  AssociationDefinition,
  AttributeDefinition,
  DomainModelDocument,
  Multiplicity,
  NodeLayout,
  Point,
} from "./schema";

const ONE: Multiplicity = { min: 1, max: "one" };
const MANY: Multiplicity = { min: 0, max: "many" };

const attribute = (id: string, rest: Partial<AttributeDefinition> = {}): AttributeDefinition => ({
  id,
  name: id,
  type: "String",
  multiplicity: ONE,
  unique: false,
  ...rest,
});

const association = (
  id: string,
  [a, aMultiplicity]: readonly [string, Multiplicity],
  [b, bMultiplicity]: readonly [string, Multiplicity],
): AssociationDefinition => ({
  id,
  ends: [
    { entityId: a, multiplicity: aMultiplicity },
    { entityId: b, multiplicity: bMultiplicity },
  ],
});

const node = (x: number, y: number, isExpanded = false): NodeLayout => ({
  position: { x, y },
  isExpanded,
});

// Post is drawn from, so its end comes first: a User writes many Posts.
const blog: DomainModelDocument = {
  version: "1.0.0",
  name: "Blog",
  entities: [
    { id: "post", name: "Post", attributes: [attribute("title"), attribute("body")] },
    {
      id: "user",
      name: "User",
      attributes: [attribute("email"), attribute("role", { type: { typeId: "role" } })],
    },
    { id: "tag", name: "Tag", attributes: [] },
    { id: "audit", name: "Audit", attributes: [] },
  ],
  types: [{ id: "role", kind: "Enum", name: "Role", values: [] }],
  associations: [
    association("writes", ["post", MANY], ["user", ONE]),
    association("tagged", ["post", MANY], ["tag", MANY]),
    association("self", ["user", ONE], ["user", MANY]),
  ],
  layout: {
    nodes: {
      post: node(500, 300, true),
      user: node(900, 120, true),
      tag: node(300, 900),
      audit: node(1200, 700),
      role: node(700, 600),
    },
    viewport: { pan: { x: 15, y: -40 }, zoom: 0.8 },
  },
};

const position = (document: DomainModelDocument, id: string): Point => {
  const layout = document.layout.nodes[id];
  if (layout === undefined) throw new Error(`no layout for ${id}`);
  return layout.position;
};

describe("arrange", () => {
  const arranged = arrange(blog);

  test("puts the one end of an association before its many end", () => {
    expect(position(arranged, "user").x).toBeLessThan(position(arranged, "post").x);
  });

  test("puts an enum after the entity that uses it", () => {
    expect(position(arranged, "user").x).toBeLessThan(position(arranged, "role").x);
  });

  test("starts at the top-left of the cards as they were", () => {
    const bounds = Geometry.boundingRect(Geometry.cardRects(arranged));
    expect(bounds).toMatchObject({ value: { x: 300, y: 120 } });
  });

  test("never overlaps cards, sized as they are drawn", () => {
    const cards = Geometry.cardBounds(arranged);
    for (const [i, { nodeId: a, rect: p }] of cards.entries()) {
      for (const { nodeId: b, rect: q } of cards.slice(i + 1)) {
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(apart, `${a} overlaps ${b}`).toBe(true);
      }
    }
  });

  test("centers an owner's header on the headers of what it owns", () => {
    const middle = (position(arranged, "post").y + position(arranged, "role").y) / 2;
    expect(Math.abs(position(arranged, "user").y - middle)).toBeLessThanOrEqual(1);
  });

  test("moves only positions", () => {
    expect(arranged.entities).toBe(blog.entities);
    expect(arranged.layout.viewport).toBe(blog.layout.viewport);
    expect(arranged.layout.nodes["post"]?.isExpanded).toBe(true);
    expect(arranged.layout.nodes["tag"]?.isExpanded).toBe(false);
  });

  test("leaves an empty document alone", () => {
    const empty = {
      ...blog,
      entities: [],
      types: [],
      associations: [],
      layout: { ...blog.layout, nodes: {} },
    };
    expect(arrange(empty)).toBe(empty);
  });
});
