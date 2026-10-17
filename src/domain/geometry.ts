import { Array, Number, Option, Order, pipe } from "effect";

import type {
  DomainModelDocument,
  EntityDefinition,
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
export const PROPERTY_ROW_HEIGHT = 30;
export const PROPERTY_EDITOR_HEIGHT = 128;
export const NODE_FOOTER_HEIGHT = 40;
export const PORT_RADIUS = 6;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
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

/** Height of a node, accounting for an inline property editor when one is
 *  open on this entity. */
export const nodeHeight = (
  entity: EntityDefinition,
  layout: NodeLayout,
  maybeEditingPropertyId: Option.Option<string>,
): number => {
  if (!layout.isExpanded) {
    return NODE_HEADER_HEIGHT;
  }
  const isEditingHere = Option.exists(maybeEditingPropertyId, (propertyId) =>
    Array.some(entity.properties, (property) => property.id === propertyId),
  );
  return (
    NODE_HEADER_HEIGHT +
    entity.properties.length * PROPERTY_ROW_HEIGHT +
    (isEditingHere ? PROPERTY_EDITOR_HEIGHT - PROPERTY_ROW_HEIGHT : 0) +
    NODE_FOOTER_HEIGHT
  );
};

export const nodeRect = (
  entity: EntityDefinition,
  layout: NodeLayout,
  maybeEditingPropertyId: Option.Option<string>,
): Rect => ({
  x: layout.position.x,
  y: layout.position.y,
  width: nodeWidth(layout),
  height: nodeHeight(entity, layout, maybeEditingPropertyId),
});

/** Vertical offset (from the node's top) of the anchor for a property row. The
 *  anchor falls back to the header when the node is collapsed or the property
 *  no longer exists. */
export const propertyAnchorOffset = (
  entity: EntityDefinition,
  layout: NodeLayout,
  maybePropertyId: Option.Option<string>,
  maybeEditingPropertyId: Option.Option<string>,
): number => {
  const headerCenter = NODE_HEADER_HEIGHT / 2;
  if (!layout.isExpanded) {
    return headerCenter;
  }
  return pipe(
    maybePropertyId,
    Option.flatMap((propertyId) =>
      Array.findFirstIndex(entity.properties, (property) => property.id === propertyId),
    ),
    Option.match({
      onNone: () => headerCenter,
      onSome: (index) => {
        const editorIndex = pipe(
          maybeEditingPropertyId,
          Option.flatMap((editingId) =>
            Array.findFirstIndex(entity.properties, (property) => property.id === editingId),
          ),
        );
        const editorShift = Option.exists(editorIndex, (editingIndex) => editingIndex < index)
          ? PROPERTY_EDITOR_HEIGHT - PROPERTY_ROW_HEIGHT
          : 0;
        const isEditingThisRow = Option.exists(
          editorIndex,
          (editingIndex) => editingIndex === index,
        );
        const rowHeight = isEditingThisRow ? PROPERTY_EDITOR_HEIGHT : PROPERTY_ROW_HEIGHT;
        return (
          NODE_HEADER_HEIGHT +
          index * PROPERTY_ROW_HEIGHT +
          editorShift +
          (isEditingThisRow ? PROPERTY_ROW_HEIGHT / 2 : rowHeight / 2)
        );
      },
    }),
  );
};

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

// VIEWPORT TRANSFORMS

export const screenToWorld = (viewport: ViewportLayout, screen: Point): Point => ({
  x: (screen.x - viewport.pan.x) / viewport.zoom,
  y: (screen.y - viewport.pan.y) / viewport.zoom,
});

export const worldToScreen = (viewport: ViewportLayout, world: Point): Point => ({
  x: world.x * viewport.zoom + viewport.pan.x,
  y: world.y * viewport.zoom + viewport.pan.y,
});

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

/** A viewport showing `bounds` centered in `screen`, never zooming past 100%. */
export const fitViewport = (bounds: Rect, screen: Size): ViewportLayout => {
  const availableWidth = Math.max(screen.width - FIT_PADDING * 2, 1);
  const availableHeight = Math.max(screen.height - FIT_PADDING * 2, 1);
  const zoom = clampZoom(
    Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
      1,
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

export const documentBounds = (document: DomainModelDocument): Option.Option<Rect> =>
  boundingRect(
    Array.getSomes(
      Array.map(document.entities, (entity) =>
        Option.map(Option.fromNullishOr(document.layout.nodes[entity.id]), (layout) =>
          nodeRect(entity, layout, Option.none()),
        ),
      ),
    ),
  );

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
