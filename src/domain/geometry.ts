import { Array, Number, Option, Order, Schema, pipe } from "effect";

import type {
  DomainModelDocument,
  EntityDefinition,
  EnumDefinition,
  NodeLayout,
  Point,
  ViewportLayout,
} from "./schema";

// NODE DIMENSIONS
// Node geometry is derived from the model rather than measured from the DOM, so
// edge anchors and fit-to-screen are deterministic. The view renders nodes
// with exactly these dimensions.

export const COLLAPSED_NODE_WIDTH = 200;
export const EXPANDED_NODE_WIDTH = 300;
export const NODE_HEADER_HEIGHT = 44;
export const ATTRIBUTE_ROW_HEIGHT = 30;
export const ATTRIBUTE_EDITOR_HEIGHT = 96;
export const ENUM_VALUE_EDITOR_HEIGHT = 96;
export const NODE_FOOTER_HEIGHT = 40;
export const PORT_RADIUS = 6;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** Multiplicative step for the HUD zoom buttons. */
export const ZOOM_STEP = 1.2;
export const FIT_PADDING = 80;

export const STAGGER_ORIGIN: Point = { x: 80, y: 80 };
export const STAGGER_STEP: Point = { x: 260, y: 180 };
export const STAGGER_COLUMNS = 4;

export type Size = Readonly<{ width: number; height: number }>;

export type Rect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const nodeWidth = (layout: NodeLayout): number =>
  layout.isExpanded ? EXPANDED_NODE_WIDTH : COLLAPSED_NODE_WIDTH;

/** What decides a card's height: its rows, and the height of the inline
 *  editor when one of those rows is open in it. Entity and enum cards share
 *  every other dimension. */
export type CardShape = Readonly<{
  rowCount: number;
  maybeEditorHeight: Option.Option<number>;
}>;

const cardShape = <Row extends Readonly<{ id: string }>>(
  rows: ReadonlyArray<Row>,
  maybeEditingRowId: Option.Option<string>,
  editorHeight: number,
): CardShape => ({
  rowCount: rows.length,
  maybeEditorHeight: pipe(
    maybeEditingRowId,
    Option.filter((rowId) => Array.some(rows, (row) => row.id === rowId)),
    Option.as(editorHeight),
  ),
});

export const entityShape = (
  entity: EntityDefinition,
  maybeEditingAttributeId: Option.Option<string>,
): CardShape => cardShape(entity.attributes, maybeEditingAttributeId, ATTRIBUTE_EDITOR_HEIGHT);

export const enumShape = (
  definition: EnumDefinition,
  maybeEditingValueId: Option.Option<string>,
): CardShape => cardShape(definition.values, maybeEditingValueId, ENUM_VALUE_EDITOR_HEIGHT);

/** Height of a card: a collapsed card is only its header. */
export const cardHeight = (shape: CardShape, layout: NodeLayout): number =>
  layout.isExpanded
    ? NODE_HEADER_HEIGHT +
      shape.rowCount * ATTRIBUTE_ROW_HEIGHT +
      Option.match(shape.maybeEditorHeight, {
        onNone: () => 0,
        onSome: (editorHeight) => editorHeight - ATTRIBUTE_ROW_HEIGHT,
      }) +
      NODE_FOOTER_HEIGHT
    : NODE_HEADER_HEIGHT;

export const cardRect = (shape: CardShape, layout: NodeLayout): Rect => ({
  x: layout.position.x,
  y: layout.position.y,
  width: nodeWidth(layout),
  height: cardHeight(shape, layout),
});

/** An entity card's rect, accounting for an inline attribute editor when one
 *  is open on this entity. */
export const nodeRect = (
  entity: EntityDefinition,
  layout: NodeLayout,
  maybeEditingAttributeId: Option.Option<string>,
): Rect => cardRect(entityShape(entity, maybeEditingAttributeId), layout);

export const enumRect = (
  definition: EnumDefinition,
  layout: NodeLayout,
  maybeEditingValueId: Option.Option<string>,
): Rect => cardRect(enumShape(definition, maybeEditingValueId), layout);

/** Vertical offset (from the node's top) of every edge and port anchor: the
 *  middle of the header, whether the node is collapsed or expanded. */
export const HEADER_ANCHOR_OFFSET = NODE_HEADER_HEIGHT / 2;

export type Side = "left" | "right";

export const anchorPoint = (rect: Rect, offsetY: number, side: Side): Point => ({
  x: side === "left" ? rect.x : rect.x + rect.width,
  y: rect.y + offsetY,
});

/** Chooses which side each end of an edge leaves from, so edges flow towards
 *  each other. Self-referencing edges loop out of and back into the right. */
export const chooseSides = (
  source: Rect,
  target: Rect,
  isSelfReference: boolean,
): Readonly<{ sourceSide: Side; targetSide: Side }> => {
  if (isSelfReference) {
    return { sourceSide: "right", targetSide: "right" };
  }
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  return sourceCenter <= targetCenter
    ? { sourceSide: "right", targetSide: "left" }
    : { sourceSide: "left", targetSide: "right" };
};

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

// VIEWPORT TRANSFORMS

export const screenToWorld = (viewport: ViewportLayout, screen: Point): Point => ({
  x: (screen.x - viewport.pan.x) / viewport.zoom,
  y: (screen.y - viewport.pan.y) / viewport.zoom,
});

export const worldToScreen = (viewport: ViewportLayout, world: Point): Point => ({
  x: world.x * viewport.zoom + viewport.pan.x,
  y: world.y * viewport.zoom + viewport.pan.y,
});

/** True when the world rect sits on screen at least NAVIGATION_MARGIN from every edge. */
export const isRectOnScreen = (viewport: ViewportLayout, screen: Size, rect: Rect): boolean => {
  const topLeft = worldToScreen(viewport, { x: rect.x, y: rect.y });
  const bottomRight = worldToScreen(viewport, {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  });
  return (
    topLeft.x >= NAVIGATION_MARGIN &&
    topLeft.y >= NAVIGATION_MARGIN &&
    bottomRight.x <= screen.width - NAVIGATION_MARGIN &&
    bottomRight.y <= screen.height - NAVIGATION_MARGIN
  );
};

export const clampZoom = (zoom: number): number =>
  Number.clamp(zoom, { minimum: MIN_ZOOM, maximum: MAX_ZOOM });

/** Zooms so that the world point under `focus` (screen coordinates) stays
 *  under it. */
export const zoomAround = (
  viewport: ViewportLayout,
  focus: Point,
  nextZoom: number,
): ViewportLayout => {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(viewport, focus);
  return {
    zoom,
    pan: { x: focus.x - world.x * zoom, y: focus.y - world.y * zoom },
  };
};

/** Converts a wheel delta into a multiplicative zoom factor. */
export const wheelZoomFactor = (deltaY: number): number => Math.exp(-deltaY * 0.0015);

export const panBy = (viewport: ViewportLayout, delta: Point): ViewportLayout => ({
  zoom: viewport.zoom,
  pan: { x: viewport.pan.x + delta.x, y: viewport.pan.y + delta.y },
});

export type WheelIntent = "Zoom" | "Pan";

/** Distinguishes a mouse wheel / pinch (zoom) from a two-finger trackpad
 *  scroll (pan). Pinch gestures arrive as wheel events with `ctrlKey` set;
 *  mouse wheels report line/page deltas or large whole-number pixel steps. */
export const classifyWheel = (
  event: Readonly<{
    ctrlKey: boolean;
    metaKey: boolean;
    deltaMode: number;
    deltaX: number;
    deltaY: number;
  }>,
): WheelIntent => {
  if (event.ctrlKey || event.metaKey || event.deltaMode !== 0) {
    return "Zoom";
  }
  if (event.deltaX !== 0) {
    return "Pan";
  }
  return globalThis.Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 50 ? "Zoom" : "Pan";
};

export const boundingRect = (rects: ReadonlyArray<Rect>): Option.Option<Rect> =>
  Array.match(rects, {
    onEmpty: () => Option.none(),
    onNonEmpty: (nonEmpty) => {
      const minX = Math.min(...Array.map(nonEmpty, (rect) => rect.x));
      const minY = Math.min(...Array.map(nonEmpty, (rect) => rect.y));
      const maxX = Math.max(...Array.map(nonEmpty, (rect) => rect.x + rect.width));
      const maxY = Math.max(...Array.map(nonEmpty, (rect) => rect.y + rect.height));
      return Option.some({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    },
  });

/**
 * Center bounds with the shared fit padding; fit-all defaults to at most 100%.
 */
export const fitViewport = (bounds: Rect, screen: Size, maximumZoom = 1): ViewportLayout => {
  const availableWidth = Math.max(screen.width - FIT_PADDING * 2, 1);
  const availableHeight = Math.max(screen.height - FIT_PADDING * 2, 1);
  const zoom = clampZoom(
    Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
      maximumZoom,
    ),
  );
  return {
    zoom,
    pan: {
      x: screen.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: screen.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    },
  };
};

/** Resets to 100% while keeping the world point at the screen center fixed. */
export const resetViewport = (viewport: ViewportLayout, screen: Size): ViewportLayout =>
  zoomAround(viewport, { x: screen.width / 2, y: screen.height / 2 }, 1);

export type CardBounds = Readonly<{ nodeId: string; rect: Rect }>;

/**
 * Persisted card bounds, with no inline editor open. Ignore orphan/missing layouts.
 */
export const cardBounds = (document: DomainModelDocument): ReadonlyArray<CardBounds> =>
  Array.getSomes([
    ...Array.map(document.entities, (entity) =>
      Option.map(Option.fromNullishOr(document.layout.nodes[entity.id]), (layout) => ({
        nodeId: entity.id,
        rect: nodeRect(entity, layout, Option.none()),
      })),
    ),
    ...Array.map(document.types, (definition) =>
      Option.map(Option.fromNullishOr(document.layout.nodes[definition.id]), (layout) => ({
        nodeId: definition.id,
        rect: enumRect(definition, layout, Option.none()),
      })),
    ),
  ]);

export const cardRects = (document: DomainModelDocument): ReadonlyArray<Rect> =>
  Array.map(cardBounds(document), ({ rect }) => rect);

// SPATIAL NAVIGATION

export const SpatialDirection = Schema.Literals(["Left", "Down", "Up", "Right"]);
export type SpatialDirection = typeof SpatialDirection.Type;
export const NAVIGATION_MARGIN = 24;

export const rectCenter = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

/**
 * Without a direction, choose the closest center. Otherwise use an inclusive
 * 90-degree cone and axis + 2 * perpendicular distance. ID breaks score ties.
 */
export const nearestCard = (
  cards: ReadonlyArray<CardBounds>,
  origin: Point,
  direction?: SpatialDirection,
): Option.Option<CardBounds> => {
  let best: CardBounds | undefined;
  let bestScore = Infinity;
  for (const card of cards) {
    const center = rectCenter(card.rect);
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const horizontal = direction === "Left" || direction === "Right";
    const axis = (horizontal ? dx : dy) * (direction === "Left" || direction === "Up" ? -1 : 1);
    const perpendicular = Math.abs(horizontal ? dy : dx);
    if (direction !== undefined && (axis <= 0 || perpendicular > axis)) continue;
    const score = direction === undefined ? distance(center, origin) : axis + 2 * perpendicular;
    if (
      score < bestScore ||
      (score === bestScore && best !== undefined && card.nodeId < best.nodeId)
    ) {
      best = card;
      bestScore = score;
    }
  }
  return Option.fromNullishOr(best);
};

/**
 * Minimum screen-space pan to reveal a card with a margin, without zooming.
 * Oversized cards cover the available axis instead; an already spanning card
 * stays put, avoiding oscillation between its two impossible-to-fit edges.
 */
export const revealRect = (viewport: ViewportLayout, rect: Rect, screen: Size): ViewportLayout => {
  const start = worldToScreen(viewport, rect);
  const shift = (position: number, size: number, extent: number): number => {
    const margin = Math.min(NAVIGATION_MARGIN, extent / 2);
    const a = margin - position;
    const b = extent - margin - (position + size * viewport.zoom);
    return Number.clamp(0, { minimum: Math.min(a, b), maximum: Math.max(a, b) });
  };
  const dx = shift(start.x, rect.width, screen.width);
  const dy = shift(start.y, rect.height, screen.height);
  return dx === 0 && dy === 0 ? viewport : panBy(viewport, { x: dx, y: dy });
};

export const documentBounds = (document: DomainModelDocument): Option.Option<Rect> =>
  boundingRect(cardRects(document));

// AUTO-STAGGER

const staggerSlot = (index: number): Point => ({
  x: STAGGER_ORIGIN.x + (index % STAGGER_COLUMNS) * STAGGER_STEP.x,
  y: STAGGER_ORIGIN.y + Math.floor(index / STAGGER_COLUMNS) * STAGGER_STEP.y,
});

const isNear = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < STAGGER_STEP.x / 2 && Math.abs(a.y - b.y) < STAGGER_STEP.y / 2;

/** The first grid slot not already occupied by one of `taken`. */
export const nextStaggerPosition = (taken: ReadonlyArray<Point>): Point => {
  const search = (index: number): Point => {
    const slot = staggerSlot(index);
    return Array.some(taken, (point) => isNear(point, slot)) ? search(index + 1) : slot;
  };
  return search(0);
};

const PLACEMENT_GAP = 24;
const PLACEMENT_STEP = 40;
const PLACEMENT_MAX_RINGS = 30;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width + PLACEMENT_GAP &&
  b.x < a.x + a.width + PLACEMENT_GAP &&
  a.y < b.y + b.height + PLACEMENT_GAP &&
  b.y < a.y + a.height + PLACEMENT_GAP;

/** Candidate offsets on the square ring `ring` steps out from the origin,
 *  nearest first. */
const ringOffsets = (ring: number): ReadonlyArray<Point> =>
  Array.sort(
    Array.filter(
      Array.flatMap(Array.range(-ring, ring), (dx) =>
        Array.map(Array.range(-ring, ring), (dy) => ({ x: dx, y: dy })),
      ),
      ({ x, y }) => Math.max(Math.abs(x), Math.abs(y)) === ring,
    ),
    Order.mapInput(Order.Number, ({ x, y }: Point) => Math.hypot(x, y)),
  );

/** The position nearest `preferred` where a node of `size` does not overlap
 *  any `occupied` rect. */
export const nearestFreePosition = (
  preferred: Point,
  size: Size,
  occupied: ReadonlyArray<Rect>,
): Point => {
  const search = (ring: number): Point => {
    const maybeFree = Array.findFirst(
      Array.map(ringOffsets(ring), (offset) => ({
        x: preferred.x + offset.x * PLACEMENT_STEP,
        y: preferred.y + offset.y * PLACEMENT_STEP,
      })),
      (candidate) => !Array.some(occupied, (rect) => overlaps({ ...candidate, ...size }, rect)),
    );
    return Option.match(maybeFree, {
      onNone: () => (ring < PLACEMENT_MAX_RINGS ? search(ring + 1) : preferred),
      onSome: (free) => free,
    });
  };
  return search(0);
};
