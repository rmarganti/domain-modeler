import type { Point } from "./schema";

// Layered (Sugiyama-style) layout, with columns running left to right. It
// only places boxes: edges are drawn by the edge router, so nothing here routes
// them. The steps follow the usual recipe, kept small:
//
// 1. Break cycles by turning around the edges that a depth-first search finds
//    pointing back at a node on its path.
// 2. Give each node a column one past its furthest predecessor, then move
//    sources next to their nearest child so they don't hang far to the left.
// 3. Split edges that skip columns into chains of empty placeholders, so they
//    take part in ordering and keep room for their lines.
// 4. Order each column by the average position of its neighbors, sweeping
//    back and forth, and keep the order with the fewest crossings.
// 5. Move each node toward the average height of its neighbors' anchors,
//    keeping the column's order and gaps (`packInOrder`).
//
// Disconnected parts are laid out alone, then wrapped into rows, largest
// first. Where nothing else decides, nodes keep the order they were given in.

/** A box to place. Edges meet it `anchor` below its top. */
export type LayoutNode = Readonly<{ id: string; width: number; height: number; anchor: number }>;

/** The edge's direction decides which end goes in the earlier column. */
export type LayoutEdge = Readonly<{ from: string; to: string }>;

export type LayeredOptions = Readonly<{
  /** Between columns. */
  columnGap: number;
  /** Between boxes in a column. */
  rowGap: number;
  /** Between disconnected parts. */
  componentGap: number;
}>;

const ORDER_SWEEPS = 24;
const ALIGN_ROUNDS = 6;
const BALANCE_ROUNDS = 30;
const UNPULLED_WEIGHT = 0.01;
/** Rows of disconnected parts aim for this width-to-height ratio. */
const PACK_ASPECT = 1.6;

/** Top-left positions keyed by node ID, with the drawing's top-left at 0, 0. */
export const layered = (
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
  options: LayeredOptions,
): ReadonlyMap<string, Point> => {
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const seen = new Set<string>();
  const links: Array<Link> = [];
  for (const { from, to } of edges) {
    const a = index.get(from);
    const b = index.get(to);
    const key = `${a}>${b}`;
    if (a === undefined || b === undefined || a === b || seen.has(key)) continue;
    seen.add(key);
    links.push([a, b]);
  }
  const parts = components(nodes.length, links).map((members) =>
    layoutPart(nodes, members, links, options),
  );
  return pack(nodes, parts, options);
};

/**
 * Tops for boxes stacked in order, as close as possible (weighted least
 * squares) to `desired` while keeping `gap` between neighbors.
 * Pool-adjacent-violators on each top minus the room the boxes above it need.
 */
export const packInOrder = (
  heights: ReadonlyArray<number>,
  desired: ReadonlyArray<number>,
  gap: number,
  weights: ReadonlyArray<number> = heights.map(() => 1),
): ReadonlyArray<number> => {
  const offsets: Array<number> = [];
  let offset = 0;
  for (const height of heights) {
    offsets.push(offset);
    offset += height + gap;
  }
  const blocks: Array<{ sum: number; weight: number; count: number }> = [];
  const mean = (block: { sum: number; weight: number }): number => block.sum / block.weight;
  desired.forEach((top, i) => {
    const weight = weights[i] ?? 1;
    blocks.push({ sum: (top - (offsets[i] ?? 0)) * weight, weight, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!;
      const previous = blocks[blocks.length - 2]!;
      if (mean(previous) <= mean(last)) break;
      blocks.pop();
      previous.sum += last.sum;
      previous.weight += last.weight;
      previous.count += last.count;
    }
  });
  return blocks
    .flatMap((block) => Array.from({ length: block.count }, () => mean(block)))
    .map((shift, i) => shift + (offsets[i] ?? 0));
};

// GRAPH

type Link = readonly [number, number];

/** Groups of connected nodes, each in the given order, ordered by first member. */
const components = (
  count: number,
  links: ReadonlyArray<Link>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const parent = Array.from({ length: count }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (const [a, b] of links) parent[root(a)] = root(b);
  const groups = new Map<number, Array<number>>();
  for (let i = 0; i < count; i++) {
    const group = groups.get(root(i));
    if (group === undefined) groups.set(root(i), [i]);
    else group.push(i);
  }
  return [...groups.values()];
};

/** Turns around the edges that point back along a depth-first path. */
const breakCycles = (count: number, links: ReadonlyArray<Link>): ReadonlyArray<Link> => {
  const outgoing = Array.from({ length: count }, (): Array<number> => []);
  links.forEach(([a], e) => outgoing[a]!.push(e));
  const state = new Uint8Array(count); // 0 unseen, 1 on the path, 2 done
  const reversed = new Set<number>();
  const visit = (v: number): void => {
    state[v] = 1;
    for (const e of outgoing[v]!) {
      const w = links[e]![1];
      if (state[w] === 1) reversed.add(e);
      else if (state[w] === 0) visit(w);
    }
    state[v] = 2;
  };
  for (let v = 0; v < count; v++) if (state[v] === 0) visit(v);
  return links.map(([a, b], e) => (reversed.has(e) ? [b, a] : [a, b]));
};

/** A column for each node of an acyclic graph. */
const assignColumns = (count: number, links: ReadonlyArray<Link>): ReadonlyArray<number> => {
  const preds = Array.from({ length: count }, (): Array<number> => []);
  const succs = Array.from({ length: count }, (): Array<number> => []);
  for (const [a, b] of links) {
    preds[b]!.push(a);
    succs[a]!.push(b);
  }
  const waiting = preds.map((list) => list.length);
  const order: Array<number> = [];
  for (let v = 0; v < count; v++) if (waiting[v] === 0) order.push(v);
  for (let i = 0; i < order.length; i++) {
    for (const w of succs[order[i]!]!) if (--waiting[w]! === 0) order.push(w);
  }
  const column = Array.from({ length: count }, () => 0);
  for (const v of order) {
    for (const p of preds[v]!) column[v] = Math.max(column[v]!, column[p]! + 1);
  }
  for (const v of [...order].reverse()) {
    if (preds[v]!.length === 0 && succs[v]!.length > 0) {
      column[v] = Math.min(...succs[v]!.map((w) => column[w]!)) - 1;
    }
  }
  const first = Math.min(...column);
  return column.map((c) => c - first);
};

// ONE PART

type Part = Readonly<{
  members: ReadonlyArray<number>;
  positions: ReadonlyArray<Point>;
  width: number;
  height: number;
}>;

/** A box in the layered graph: one of the part's nodes, or a placeholder on a long edge. */
type Slot = { column: number; width: number; height: number; anchor: number };

const layoutPart = (
  nodes: ReadonlyArray<LayoutNode>,
  members: ReadonlyArray<number>,
  allLinks: ReadonlyArray<Link>,
  options: LayeredOptions,
): Part => {
  const local = new Map(members.map((node, i) => [node, i]));
  const links = breakCycles(
    members.length,
    allLinks.flatMap(([a, b]) => {
      const p = local.get(a);
      const q = local.get(b);
      return p === undefined || q === undefined ? [] : [[p, q] as const];
    }),
  );
  const columns = assignColumns(members.length, links);

  const slots: Array<Slot> = members.map((node, i) => ({
    column: columns[i]!,
    width: nodes[node]!.width,
    height: nodes[node]!.height,
    anchor: nodes[node]!.anchor,
  }));
  const preds: Array<Array<number>> = slots.map(() => []);
  const succs: Array<Array<number>> = slots.map(() => []);
  const connect = (a: number, b: number): void => {
    succs[a]!.push(b);
    preds[b]!.push(a);
  };
  for (const [a, b] of links) {
    let tail = a;
    for (let column = slots[a]!.column + 1; column < slots[b]!.column; column++) {
      const placeholder = slots.push({ column, width: 0, height: 0, anchor: 0 }) - 1;
      preds.push([]);
      succs.push([]);
      connect(tail, placeholder);
      tail = placeholder;
    }
    connect(tail, b);
  }

  const layers = orderLayers(slots, preds, succs, firstSeen(slots, succs, preds));
  const tops = alignLayers(slots, layers, preds, succs, options.rowGap);

  const lefts: Array<number> = [];
  let left = 0;
  for (const layer of layers) {
    lefts.push(left);
    left += Math.max(0, ...layer.map((s) => slots[s]!.width)) + options.columnGap;
  }
  const top = Math.min(...tops);
  const positions = members.map((_, i) => ({
    x: lefts[slots[i]!.column]!,
    y: tops[i]! - top,
  }));
  return {
    members,
    positions,
    width: Math.max(...positions.map((p, i) => p.x + slots[i]!.width)),
    height: Math.max(...positions.map((p, i) => p.y + slots[i]!.height)),
  };
};

/** Depth-first visiting order from the part's nodes in their given order, so
 *  that connected nodes start out near each other. */
const firstSeen = (
  slots: ReadonlyArray<Slot>,
  succs: ReadonlyArray<ReadonlyArray<number>>,
  preds: ReadonlyArray<ReadonlyArray<number>>,
): ReadonlyArray<number> => {
  const rank = Array.from({ length: slots.length }, () => -1);
  let next = 0;
  const visit = (v: number): void => {
    if (rank[v] !== -1) return;
    rank[v] = next++;
    succs[v]!.forEach(visit);
    preds[v]!.forEach(visit);
  };
  slots.forEach((_, v) => visit(v));
  return rank;
};

const orderLayers = (
  slots: ReadonlyArray<Slot>,
  preds: ReadonlyArray<ReadonlyArray<number>>,
  succs: ReadonlyArray<ReadonlyArray<number>>,
  initial: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const count = Math.max(...slots.map((s) => s.column)) + 1;
  let layers: Array<Array<number>> = Array.from({ length: count }, () => []);
  slots.forEach((slot, s) => layers[slot.column]!.push(s));
  layers = layers.map((layer) => [...layer].sort((a, b) => initial[a]! - initial[b]!));

  const position = Array.from({ length: slots.length }, () => 0);
  const place = (layer: ReadonlyArray<number>): void => layer.forEach((s, i) => (position[s] = i));
  layers.forEach(place);

  const sortBy = (layer: Array<number>, neighbors: ReadonlyArray<ReadonlyArray<number>>) => {
    const key = (s: number): number => {
      const list = neighbors[s]!;
      return list.length === 0
        ? position[s]!
        : list.reduce((sum, n) => sum + position[n]!, 0) / list.length;
    };
    const sorted = [...layer].sort((a, b) => key(a) - key(b));
    place(sorted);
    return sorted;
  };

  const crossings = (): number => {
    let total = 0;
    for (const layer of layers) {
      const ends = layer.flatMap((a) =>
        succs[a]!.map((b) => [position[a]!, position[b]!] as const),
      );
      ends.forEach(([a1, b1], i) => {
        for (const [a2, b2] of ends.slice(i + 1)) if ((a1 - a2) * (b1 - b2) < 0) total++;
      });
    }
    return total;
  };

  let best = layers;
  let fewest = crossings();
  for (let sweep = 0; sweep < ORDER_SWEEPS && fewest > 0; sweep++) {
    const downward = sweep % 2 === 0;
    for (let i = 1; i < count; i++) {
      const c = downward ? i : count - 1 - i;
      layers[c] = sortBy(layers[c]!, downward ? preds : succs);
    }
    const found = crossings();
    if (found < fewest) {
      fewest = found;
      best = layers.map((layer) => [...layer]);
    }
  }
  return best;
};

const alignLayers = (
  slots: ReadonlyArray<Slot>,
  layers: ReadonlyArray<ReadonlyArray<number>>,
  preds: ReadonlyArray<ReadonlyArray<number>>,
  succs: ReadonlyArray<ReadonlyArray<number>>,
  gap: number,
): ReadonlyArray<number> => {
  const tops = Array.from({ length: slots.length }, () => 0);
  const align = (
    layer: ReadonlyArray<number>,
    neighborsOf: (s: number) => ReadonlyArray<number>,
  ) => {
    const desired = layer.map((s) => {
      const list = neighborsOf(s);
      if (list.length === 0) return tops[s]!;
      const anchor = list.reduce((sum, n) => sum + tops[n]! + slots[n]!.anchor, 0) / list.length;
      return anchor - slots[s]!.anchor;
    });
    // Weighting by edge count minimizes the total squared edge slope, so the
    // rounds settle instead of drifting. A box with no neighbors barely resists.
    packInOrder(
      layer.map((s) => slots[s]!.height),
      desired,
      gap,
      layer.map((s) => neighborsOf(s).length || UNPULLED_WEIGHT),
    ).forEach((top, i) => (tops[layer[i]!] = top));
  };

  layers.forEach((layer) => align(layer, () => []));
  const both = (s: number) => [...preds[s]!, ...succs[s]!];
  for (let round = 0; round < ALIGN_ROUNDS; round++) {
    for (const layer of layers.slice(1)) align(layer, (s) => preds[s]!);
    for (const layer of [...layers].reverse().slice(1)) align(layer, (s) => succs[s]!);
  }
  for (let round = 0; round < BALANCE_ROUNDS; round++) {
    layers.forEach((layer) => align(layer, both));
  }
  return tops.map((top) => Math.round(top));
};

// PACKING

/** Wraps parts into rows, largest first, aiming for a wide drawing. */
const pack = (
  nodes: ReadonlyArray<LayoutNode>,
  parts: ReadonlyArray<Part>,
  options: LayeredOptions,
): ReadonlyMap<string, Point> => {
  const gap = options.componentGap;
  const area = parts.reduce((sum, p) => sum + (p.width + gap) * (p.height + gap), 0);
  const rowWidth = Math.max(...parts.map((p) => p.width), Math.sqrt(area * PACK_ASPECT));
  const positions = new Map<string, Point>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const part of [...parts].sort((a, b) => b.members.length - a.members.length)) {
    if (x > 0 && x + part.width > rowWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    part.members.forEach((node, i) => {
      const { x: px, y: py } = part.positions[i]!;
      positions.set(nodes[node]!.id, { x: x + px, y: y + py });
    });
    x += part.width + gap;
    rowHeight = Math.max(rowHeight, part.height);
  }
  return positions;
};
