import type { Side } from "./geometry";
import type { Point } from "./schema";

/** Abstract routing for relationship edges. UI components depend only on this
 *  interface, so an orthogonal / Manhattan router can replace the Bézier one
 *  without touching them. */
export interface EdgeRouter {
  computePath(source: Point, target: Point, sourceSide: Side, targetSide: Side): string;
  computeMidpoint(source: Point, target: Point): Point;
}

const MIN_HANDLE = 60;

const handleLength = (source: Point, target: Point): number =>
  Math.max(MIN_HANDLE, Math.abs(target.x - source.x) / 2);

const direction = (side: Side): number => (side === "left" ? -1 : 1);

const format = (value: number): string => value.toFixed(1);

/** Smooth cubic Bézier curves whose handles leave each node horizontally. */
export const bezierRouter: EdgeRouter = {
  computePath: (source, target, sourceSide, targetSide) => {
    const length = handleLength(source, target);
    const sameSide = sourceSide === targetSide;
    // NOTE: edges leaving and entering the same side (self references) need
    // longer handles to loop visibly outside the node.
    const loop = sameSide ? Math.max(length, 90) : length;
    const c1 = { x: source.x + direction(sourceSide) * loop, y: source.y };
    const c2 = { x: target.x + direction(targetSide) * loop, y: target.y };
    return [
      `M ${format(source.x)} ${format(source.y)}`,
      `C ${format(c1.x)} ${format(c1.y)},`,
      `${format(c2.x)} ${format(c2.y)},`,
      `${format(target.x)} ${format(target.y)}`,
    ].join(" ");
  },
  computeMidpoint: (source, target) => ({
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  }),
};
