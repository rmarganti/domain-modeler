import { Array, Option, Record, pipe } from "effect";

import {
  COLLAPSED_NODE_WIDTH,
  NODE_HEADER_HEIGHT,
  nearestFreePosition,
  nextStaggerPosition,
  nodeRect,
  type Rect,
} from "./geometry";
import type {
  AssociationDefinition,
  AssociationEnd,
  DomainLayout,
  DomainModelDocument,
  EndIndex,
  EntityDefinition,
  Multiplicity,
  NodeLayout,
  Point,
  PropertyDefinition,
  ViewportLayout,
} from "./schema";

// CONSTRUCTION

export const DEFAULT_VIEWPORT: ViewportLayout = { pan: { x: 0, y: 0 }, zoom: 1 };

export const emptyDocument = (name: string): DomainModelDocument => ({
  version: "1.0.0",
  name,
  entities: [],
  associations: [],
  layout: { nodes: {}, viewport: DEFAULT_VIEWPORT },
});

// IDS
// IDs are derived from the document, not from randomness, so update stays
// pure and deterministic. A prefix plus one more than the largest numeric
// suffix in use can never collide.

export type IdPrefix = "e" | "p" | "r";

const allIds = (document: DomainModelDocument): ReadonlyArray<string> => [
  ...Array.map(document.entities, (entity) => entity.id),
  ...Array.flatMap(document.entities, (entity) =>
    Array.map(entity.properties, (property) => property.id),
  ),
  ...Array.map(document.associations, (association) => association.id),
];

export const nextId = (document: DomainModelDocument, prefix: IdPrefix): string => {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const largest = pipe(
    allIds(document),
    Array.map((id) => Option.map(Option.fromNullishOr(pattern.exec(id)?.[1]), Number)),
    Array.getSomes,
    Array.reduce(0, Math.max),
  );
  return `${prefix}${largest + 1}`;
};

// LOOKUP

export const findEntity = (
  document: DomainModelDocument,
  entityId: string,
): Option.Option<EntityDefinition> =>
  Array.findFirst(document.entities, (entity) => entity.id === entityId);

export const findProperty = (
  entity: EntityDefinition,
  propertyId: string,
): Option.Option<PropertyDefinition> =>
  Array.findFirst(entity.properties, (property) => property.id === propertyId);

export const findAssociation = (
  document: DomainModelDocument,
  associationId: string,
): Option.Option<AssociationDefinition> =>
  Array.findFirst(document.associations, (association) => association.id === associationId);

export const findNode = (
  document: DomainModelDocument,
  entityId: string,
): Option.Option<NodeLayout> => Option.fromNullishOr(document.layout.nodes[entityId]);

// LAYOUT SYNC (bi-directional invariants)

const nodePositions = (nodes: DomainLayout["nodes"]): ReadonlyArray<Point> =>
  Array.map(Record.values(nodes), (node) => node.position);

/** Restores the layout invariants: every entity has a layout node (missing
 *  ones get auto-staggered positions) and no layout node outlives its entity. */
export const syncLayout = (document: DomainModelDocument): DomainModelDocument => {
  const entityIds = new Set(Array.map(document.entities, (entity) => entity.id));
  const keptNodes = Record.filter(document.layout.nodes, (_node, entityId) =>
    entityIds.has(entityId),
  );
  const nodes = Array.reduce(document.entities, keptNodes, (acc, entity) =>
    entity.id in acc
      ? acc
      : {
          ...acc,
          [entity.id]: {
            position: nextStaggerPosition(nodePositions(acc)),
            isExpanded: false,
          },
        },
  );
  return { ...document, layout: { ...document.layout, nodes } };
};

// ENTITIES

const occupiedRects = (document: DomainModelDocument): ReadonlyArray<Rect> =>
  Array.getSomes(
    Array.map(document.entities, (entity) =>
      Option.map(findNode(document, entity.id), (node) => nodeRect(entity, node, Option.none())),
    ),
  );

export const addEntity = (
  document: DomainModelDocument,
  entityId: string,
  name: string,
  position: Point,
): DomainModelDocument => ({
  ...document,
  entities: [...document.entities, { id: entityId, name, properties: [] }],
  layout: {
    ...document.layout,
    nodes: {
      ...document.layout.nodes,
      [entityId]: {
        position: nearestFreePosition(
          position,
          { width: COLLAPSED_NODE_WIDTH, height: NODE_HEADER_HEIGHT },
          occupiedRects(document),
        ),
        isExpanded: false,
      },
    },
  },
});

const mapEntity = (
  document: DomainModelDocument,
  entityId: string,
  f: (entity: EntityDefinition) => EntityDefinition,
): DomainModelDocument => ({
  ...document,
  entities: Array.map(document.entities, (entity) => (entity.id === entityId ? f(entity) : entity)),
});

export const renameEntity = (
  document: DomainModelDocument,
  entityId: string,
  name: string,
): DomainModelDocument => mapEntity(document, entityId, (entity) => ({ ...entity, name }));

/** Removes an entity, its layout node, and every association touching it. */
export const deleteEntity = (
  document: DomainModelDocument,
  entityId: string,
): DomainModelDocument => ({
  ...document,
  entities: Array.filter(document.entities, (entity) => entity.id !== entityId),
  associations: Array.filter(
    document.associations,
    (association) => !Array.some(association.ends, (end) => end.entityId === entityId),
  ),
  layout: {
    ...document.layout,
    nodes: Record.remove(document.layout.nodes, entityId),
  },
});

// PROPERTIES

export const newProperty = (propertyId: string, name: string): PropertyDefinition => ({
  id: propertyId,
  name,
  type: "String",
  isOptional: false,
  isNullable: false,
});

export const addProperty = (
  document: DomainModelDocument,
  entityId: string,
  property: PropertyDefinition,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    properties: [...entity.properties, property],
  }));

export const replaceProperty = (
  document: DomainModelDocument,
  entityId: string,
  property: PropertyDefinition,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    properties: Array.map(entity.properties, (existing) =>
      existing.id === property.id ? property : existing,
    ),
  }));

export const deleteProperty = (
  document: DomainModelDocument,
  entityId: string,
  propertyId: string,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    properties: Array.filter(entity.properties, (property) => property.id !== propertyId),
  }));

export type MoveDirection = "Up" | "Down";

export const moveProperty = (
  document: DomainModelDocument,
  entityId: string,
  propertyId: string,
  direction: MoveDirection,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) =>
    pipe(
      Array.findFirstIndex(entity.properties, (property) => property.id === propertyId),
      Option.flatMap((index) => {
        const swapIndex = direction === "Up" ? index - 1 : index + 1;
        return Option.all([
          Array.get(entity.properties, index),
          Array.get(entity.properties, swapIndex),
        ]).pipe(
          Option.map(([moving, displaced]) =>
            Array.map(entity.properties, (property, propertyIndex) =>
              propertyIndex === index ? displaced : propertyIndex === swapIndex ? moving : property,
            ),
          ),
        );
      }),
      Option.match({
        onNone: () => entity,
        onSome: (properties) => ({ ...entity, properties }),
      }),
    ),
  );

// ASSOCIATIONS

/** An association as first drawn: one `from` per many `to`s. */
export const newAssociation = (
  associationId: string,
  fromEntityId: string,
  toEntityId: string,
): AssociationDefinition => ({
  id: associationId,
  ends: [
    { entityId: fromEntityId, multiplicity: { min: 1, max: "one" } },
    { entityId: toEntityId, multiplicity: { min: 0, max: "many" } },
  ],
});

export const addAssociation = (
  document: DomainModelDocument,
  association: AssociationDefinition,
): DomainModelDocument => ({
  ...document,
  associations: [...document.associations, association],
});

export const replaceAssociation = (
  document: DomainModelDocument,
  association: AssociationDefinition,
): DomainModelDocument => ({
  ...document,
  associations: Array.map(document.associations, (existing) =>
    existing.id === association.id ? association : existing,
  ),
});

const mapAssociation = (
  document: DomainModelDocument,
  associationId: string,
  f: (association: AssociationDefinition) => AssociationDefinition,
): DomainModelDocument => ({
  ...document,
  associations: Array.map(document.associations, (association) =>
    association.id === associationId ? f(association) : association,
  ),
});

const mapEnd = (
  document: DomainModelDocument,
  associationId: string,
  endIndex: EndIndex,
  f: (end: AssociationEnd) => AssociationEnd,
): DomainModelDocument =>
  mapAssociation(document, associationId, (association) => {
    const [first, second] = association.ends;
    return {
      ...association,
      ends: endIndex === 0 ? [f(first), second] : [first, f(second)],
    };
  });

export const setEndMultiplicity = (
  document: DomainModelDocument,
  associationId: string,
  endIndex: EndIndex,
  multiplicity: Multiplicity,
): DomainModelDocument =>
  mapEnd(document, associationId, endIndex, (end) => ({ ...end, multiplicity }));

/** Sets an end's role; a blank role removes it so the default applies. */
export const setEndRole = (
  document: DomainModelDocument,
  associationId: string,
  endIndex: EndIndex,
  role: string,
): DomainModelDocument =>
  mapEnd(document, associationId, endIndex, (end) => {
    const { role: _previous, ...rest } = end;
    return role.trim() === "" ? rest : { ...rest, role: role.trim() };
  });

export const renameAssociation = (
  document: DomainModelDocument,
  associationId: string,
  name: string,
): DomainModelDocument =>
  mapAssociation(document, associationId, (association) => {
    const { name: _previous, ...rest } = association;
    return name.trim() === "" ? rest : { ...rest, name: name.trim() };
  });

export const setAssociationDescription = (
  document: DomainModelDocument,
  associationId: string,
  description: string,
): DomainModelDocument =>
  mapAssociation(document, associationId, (association) => {
    const { description: _previous, ...rest } = association;
    return description.trim() === "" ? rest : { ...rest, description: description.trim() };
  });

export const deleteAssociation = (
  document: DomainModelDocument,
  associationId: string,
): DomainModelDocument => ({
  ...document,
  associations: Array.filter(
    document.associations,
    (association) => association.id !== associationId,
  ),
});

// LAYOUT

const mapNode = (
  document: DomainModelDocument,
  entityId: string,
  f: (node: NodeLayout) => NodeLayout,
): DomainModelDocument => ({
  ...document,
  layout: {
    ...document.layout,
    nodes: Option.match(findNode(document, entityId), {
      onNone: () => document.layout.nodes,
      onSome: (node) => ({ ...document.layout.nodes, [entityId]: f(node) }),
    }),
  },
});

export const moveNode = (
  document: DomainModelDocument,
  entityId: string,
  position: Point,
): DomainModelDocument => mapNode(document, entityId, (node) => ({ ...node, position }));

export const setExpanded = (
  document: DomainModelDocument,
  entityId: string,
  isExpanded: boolean,
): DomainModelDocument => mapNode(document, entityId, (node) => ({ ...node, isExpanded }));

export const setViewport = (
  document: DomainModelDocument,
  viewport: ViewportLayout,
): DomainModelDocument => ({
  ...document,
  layout: { ...document.layout, viewport },
});

export const renameDocument = (
  document: DomainModelDocument,
  name: string,
): DomainModelDocument => ({ ...document, name });

/** Carries presentation state (viewport and expansion) from `current` onto
 *  `restored`, so undo and redo change the model without yanking the camera
 *  or collapsing the cards the user is looking at. */
export const preservePresentation = (
  restored: DomainModelDocument,
  current: DomainModelDocument,
): DomainModelDocument => ({
  ...restored,
  layout: {
    viewport: current.layout.viewport,
    nodes: Record.map(restored.layout.nodes, (node, entityId) =>
      pipe(
        Option.fromNullishOr(current.layout.nodes[entityId]),
        Option.match({
          onNone: () => node,
          onSome: (currentNode) => ({
            ...node,
            isExpanded: currentNode.isExpanded,
          }),
        }),
      ),
    ),
  },
});

// SAMPLE

export const sampleDocument: DomainModelDocument = {
  version: "1.0.0",
  name: "Blog",
  entities: [
    {
      id: "e1",
      name: "User",
      description: "A registered author or reader.",
      properties: [
        {
          id: "p2",
          name: "email",
          type: "String",
          isOptional: false,
          isNullable: false,
        },
        {
          id: "p3",
          name: "displayName",
          type: "String",
          isOptional: true,
          isNullable: false,
        },
        {
          id: "p4",
          name: "role",
          type: "Literal",
          literalOptions: ["reader", "author", "admin"],
          isOptional: false,
          isNullable: false,
        },
      ],
    },
    {
      id: "e2",
      name: "Post",
      properties: [
        {
          id: "p7",
          name: "title",
          type: "String",
          isOptional: false,
          isNullable: false,
        },
        {
          id: "p8",
          name: "publishedAt",
          type: "Date",
          isOptional: false,
          isNullable: true,
        },
      ],
    },
    {
      id: "e3",
      name: "Tag",
      properties: [
        {
          id: "p10",
          name: "label",
          type: "String",
          isOptional: false,
          isNullable: false,
        },
      ],
    },
  ],
  associations: [
    {
      id: "r1",
      name: "writes",
      ends: [
        { entityId: "e1", multiplicity: { min: 1, max: "one" } },
        { entityId: "e2", multiplicity: { min: 0, max: "many" } },
      ],
    },
    {
      id: "r2",
      name: "tagged",
      ends: [
        { entityId: "e2", multiplicity: { min: 0, max: "many" } },
        { entityId: "e3", multiplicity: { min: 0, max: "many" } },
      ],
    },
  ],
  layout: {
    nodes: {
      e1: { position: { x: 120, y: 140 }, isExpanded: true },
      e2: { position: { x: 560, y: 220 }, isExpanded: true },
      e3: { position: { x: 980, y: 140 }, isExpanded: false },
    },
    viewport: DEFAULT_VIEWPORT,
  },
};
