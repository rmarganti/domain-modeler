import { Array, Option, Record } from "effect";

import * as Geometry from "./geometry";
import { layered, type LayoutEdge } from "./layered";
import { isTypeRef, type AssociationDefinition, type DomainModelDocument } from "./schema";

/** Room for relationship labels, like `uses enum 0..* — 0..1`, between columns. */
const COLUMN_GAP = 200;
const ROW_GAP = 40;
const COMPONENT_GAP = 120;

/**
 * Lays the cards out in columns, left to right, at their current sizes. The
 * drawing keeps the top-left of the cards as they were, so the arranged model
 * stays where the user was looking.
 */
export const arrange = (document: DomainModelDocument): DomainModelDocument => {
  const cards = Geometry.cardBounds(document);
  if (cards.length === 0) return document;
  const positions = layered(
    Array.map(cards, ({ nodeId, rect }) => ({
      id: nodeId,
      width: rect.width,
      height: rect.height,
      anchor: Geometry.HEADER_ANCHOR_OFFSET,
    })),
    layoutEdges(document),
    { columnGap: COLUMN_GAP, rowGap: ROW_GAP, componentGap: COMPONENT_GAP },
  );
  const origin = Option.match(Geometry.documentBounds(document), {
    onNone: () => Geometry.STAGGER_ORIGIN,
    onSome: ({ x, y }) => ({ x, y }),
  });
  return {
    ...document,
    layout: {
      ...document.layout,
      nodes: Record.map(document.layout.nodes, (node, nodeId) =>
        Option.match(Option.fromNullishOr(positions.get(nodeId)), {
          onNone: () => node,
          onSome: ({ x, y }) => ({
            ...node,
            position: { x: Math.round(origin.x + x), y: Math.round(origin.y + y) },
          }),
        }),
      ),
    },
  };
};

/** Associations run from their one end to their many end, so owners come
 *  before what they own. Enums come after the entities whose fields use them. */
const layoutEdges = (document: DomainModelDocument): ReadonlyArray<LayoutEdge> => [
  ...Array.map(document.associations, associationEdge),
  ...Array.flatMap(document.entities, (entity) =>
    Array.flatMap(entity.attributes, ({ type }) =>
      isTypeRef(type) ? [{ from: entity.id, to: type.typeId }] : [],
    ),
  ),
];

const associationEdge = ({ ends: [first, second] }: AssociationDefinition): LayoutEdge =>
  first.multiplicity.max === "many" && second.multiplicity.max === "one"
    ? { from: second.entityId, to: first.entityId }
    : { from: first.entityId, to: second.entityId };
