import { describe, expect, test } from "vitest";

import { layered, packInOrder, type LayoutEdge, type LayoutNode } from "./layered";
import type { Point } from "./schema";

const OPTIONS = { columnGap: 100, rowGap: 20, componentGap: 60 };

const box = (id: string, height = 40, width = 200): LayoutNode => ({
  id,
  width,
  height,
  anchor: 20,
});

const edge = (from: string, to: string): LayoutEdge => ({ from, to });

const at = (positions: ReadonlyMap<string, Point>, id: string): Point => {
  const point = positions.get(id);
  if (point === undefined) throw new Error(`no position for ${id}`);
  return point;
};

const overlapping = (
  nodes: ReadonlyArray<LayoutNode>,
  positions: ReadonlyMap<string, Point>,
): ReadonlyArray<string> =>
  nodes.flatMap((a, i) =>
    nodes.slice(i + 1).flatMap((b) => {
      const p = at(positions, a.id);
      const q = at(positions, b.id);
      const apart =
        p.x + a.width <= q.x ||
        q.x + b.width <= p.x ||
        p.y + a.height <= q.y ||
        q.y + b.height <= p.y;
      return apart ? [] : [`${a.id}/${b.id}`];
    }),
  );

describe("packInOrder", () => {
  test("keeps tops that already leave room", () => {
    expect(packInOrder([10, 10], [0, 50], 5)).toEqual([0, 50]);
  });

  test("spreads a clash evenly around where the boxes want to be", () => {
    expect(packInOrder([10, 10], [0, 0], 10)).toEqual([-10, 10]);
  });

  test("keeps the order even when the targets are reversed", () => {
    const [first = 0, second = 0] = packInOrder([10, 10], [100, 0], 0);
    expect(second).toBeGreaterThanOrEqual(first + 10);
  });
});

describe("layered", () => {
  test("places each node of a chain in its own column, left to right", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const positions = layered(nodes, [edge("a", "b"), edge("b", "c")], OPTIONS);
    expect(at(positions, "a")).toEqual({ x: 0, y: 0 });
    expect(at(positions, "b")).toEqual({ x: 300, y: 0 });
    expect(at(positions, "c")).toEqual({ x: 600, y: 0 });
  });

  test("lines up the anchors of nodes of different heights", () => {
    const nodes = [{ ...box("a", 200), anchor: 20 }, box("b", 40)];
    const positions = layered(nodes, [edge("a", "b")], OPTIONS);
    expect(at(positions, "a").y + 20).toBe(at(positions, "b").y + 20);
  });

  test("stacks children in the next column and centers the parent on them", () => {
    const nodes = [box("parent"), box("left"), box("right")];
    const positions = layered(nodes, [edge("parent", "left"), edge("parent", "right")], OPTIONS);
    const first = at(positions, "left");
    const second = at(positions, "right");
    expect(first.x).toBe(second.x);
    expect(second.y).toBe(first.y + 40 + 20);
    expect(at(positions, "parent").y).toBe((first.y + second.y) / 2);
  });

  test("orders a column to undo crossings", () => {
    // Written so that the first pass crosses a→d and b→c.
    const nodes = [box("a"), box("b"), box("c"), box("d")];
    const positions = layered(nodes, [edge("a", "d"), edge("b", "c")], OPTIONS);
    const aAbove = at(positions, "a").y < at(positions, "b").y;
    const dAbove = at(positions, "d").y < at(positions, "c").y;
    expect(aAbove).toBe(dAbove);
  });

  test("moves a source next to its only child", () => {
    const nodes = [box("a"), box("b"), box("c"), box("side")];
    const positions = layered(nodes, [edge("a", "b"), edge("b", "c"), edge("side", "c")], OPTIONS);
    expect(at(positions, "side").x).toBe(at(positions, "b").x);
  });

  test("lays out cycles and edges that skip columns", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("a", "c")];
    const positions = layered(nodes, edges, OPTIONS);
    expect(positions.size).toBe(3);
    expect(overlapping(nodes, positions)).toEqual([]);
  });

  test("ignores self references and unknown ends", () => {
    const positions = layered([box("a")], [edge("a", "a"), edge("a", "ghost")], OPTIONS);
    expect(at(positions, "a")).toEqual({ x: 0, y: 0 });
  });

  test("never overlaps nodes, in a graph with long edges and mixed sizes", () => {
    const nodes = [
      box("root", 300, 300),
      box("a", 120),
      box("b", 40),
      box("c", 200, 300),
      box("d", 80),
      box("e", 40),
      box("f", 160),
    ];
    const edges = [
      edge("root", "a"),
      edge("root", "b"),
      edge("root", "e"),
      edge("a", "c"),
      edge("b", "c"),
      edge("c", "d"),
      edge("b", "f"),
      edge("root", "d"),
    ];
    const positions = layered(nodes, edges, OPTIONS);
    expect(overlapping(nodes, positions)).toEqual([]);
    for (const { from, to } of edges) {
      expect(at(positions, from).x).toBeLessThan(at(positions, to).x);
    }
  });

  test("puts the largest group first and wraps the rest below it", () => {
    const nodes = [box("lonely"), box("a"), box("b"), box("c"), box("other")];
    const positions = layered(nodes, [edge("a", "b"), edge("b", "c")], OPTIONS);
    expect(at(positions, "a")).toEqual({ x: 0, y: 0 });
    expect(at(positions, "lonely").y).toBeGreaterThanOrEqual(40 + 60);
    expect(overlapping(nodes, positions)).toEqual([]);
  });

  test("gives the same answer every time", () => {
    const nodes = [box("a"), box("b"), box("c"), box("d", 90)];
    const edges = [edge("a", "c"), edge("b", "c"), edge("a", "d"), edge("d", "b")];
    expect([...layered(nodes, edges, OPTIONS)]).toEqual([...layered(nodes, edges, OPTIONS)]);
  });
});
