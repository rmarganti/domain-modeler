import { Array, Option, Record, pipe } from "effect";

import {
  COLLAPSED_NODE_WIDTH,
  NODE_HEADER_HEIGHT,
  cardRects,
  enumRect,
  nearestFreePosition,
  nextStaggerPosition,
  nodeRect,
} from "./geometry";
import {
  isTypeRef,
  type AssociationDefinition,
  type AssociationEnd,
  type AttributeType,
  type DomainLayout,
  type DomainModelDocument,
  type EndIndex,
  type EntityDefinition,
  type EnumDefinition,
  type EnumValue,
  type Multiplicity,
  type NodeLayout,
  type Point,
  type AttributeDefinition,
  type ViewportLayout,
} from "./schema";

// CONSTRUCTION

export const DEFAULT_VIEWPORT: ViewportLayout = { pan: { x: 0, y: 0 }, zoom: 1 };

export const emptyDocument = (name: string): DomainModelDocument => ({
  version: "1.0.0",
  name,
  entities: [],
  types: [],
  associations: [],
  layout: { nodes: {}, viewport: DEFAULT_VIEWPORT },
});

// IDS
// IDs are derived from the document, not from randomness, so update stays
// pure and deterministic. A prefix plus one more than the largest numeric
// suffix in use can never collide.

export type IdPrefix = "e" | "p" | "t" | "v" | "r";

const allIds = (document: DomainModelDocument): ReadonlyArray<string> => [
  ...Array.map(document.entities, (entity) => entity.id),
  ...Array.flatMap(document.entities, (entity) =>
    Array.map(entity.attributes, (attribute) => attribute.id),
  ),
  ...Array.map(document.types, (definition) => definition.id),
  ...Array.flatMap(document.types, (definition) =>
    Array.map(definition.values, (value) => value.id),
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

export const findAttribute = (
  entity: EntityDefinition,
  attributeId: string,
): Option.Option<AttributeDefinition> =>
  Array.findFirst(entity.attributes, (attribute) => attribute.id === attributeId);

export const findEnum = (
  document: DomainModelDocument,
  typeId: string,
): Option.Option<EnumDefinition> =>
  Array.findFirst(document.types, (definition) => definition.id === typeId);

export const findEnumValue = (
  definition: EnumDefinition,
  valueId: string,
): Option.Option<EnumValue> => Array.findFirst(definition.values, (value) => value.id === valueId);

export const findAssociation = (
  document: DomainModelDocument,
  associationId: string,
): Option.Option<AssociationDefinition> =>
  Array.findFirst(document.associations, (association) => association.id === associationId);

/** How an attribute's type reads: the primitive's name, the referenced enum's
 *  name, or `?` when the reference dangles. */
export const attributeTypeLabel = (document: DomainModelDocument, type: AttributeType): string =>
  isTypeRef(type)
    ? Option.match(findEnum(document, type.typeId), {
        onNone: () => "?",
        onSome: (definition) => definition.name,
      })
    : type;

/** The layout node of an entity or type card. */
export const findNode = (
  document: DomainModelDocument,
  nodeId: string,
): Option.Option<NodeLayout> => Option.fromNullishOr(document.layout.nodes[nodeId]);

// LAYOUT SYNC (bi-directional invariants)

const nodePositions = (nodes: DomainLayout["nodes"]): ReadonlyArray<Point> =>
  Array.map(Record.values(nodes), (node) => node.position);

const cardIds = (document: DomainModelDocument): ReadonlyArray<string> => [
  ...Array.map(document.entities, (entity) => entity.id),
  ...Array.map(document.types, (definition) => definition.id),
];

/** Restores the layout invariants: every entity and type has a layout node
 *  (missing ones get auto-staggered positions) and no layout node outlives
 *  its entity or type. */
export const syncLayout = (document: DomainModelDocument): DomainModelDocument => {
  const ids = cardIds(document);
  const idSet = new Set(ids);
  const keptNodes = Record.filter(document.layout.nodes, (_node, nodeId) => idSet.has(nodeId));
  const nodes = Array.reduce(ids, keptNodes, (acc, nodeId) =>
    nodeId in acc
      ? acc
      : {
          ...acc,
          [nodeId]: {
            position: nextStaggerPosition(nodePositions(acc)),
            isExpanded: false,
          },
        },
  );
  return { ...document, layout: { ...document.layout, nodes } };
};

// ENTITIES

/** A collapsed layout node for a new card, nudged to the nearest spot near
 *  `position` that no existing card covers. */
const placeNewNode = (
  document: DomainModelDocument,
  nodeId: string,
  position: Point,
): DomainLayout => ({
  ...document.layout,
  nodes: {
    ...document.layout.nodes,
    [nodeId]: {
      position: nearestFreePosition(
        position,
        { width: COLLAPSED_NODE_WIDTH, height: NODE_HEADER_HEIGHT },
        cardRects(document),
      ),
      isExpanded: false,
    },
  },
});

export const addEntity = (
  document: DomainModelDocument,
  entityId: string,
  name: string,
  position: Point,
): DomainModelDocument => ({
  ...document,
  entities: [...document.entities, { id: entityId, name, attributes: [] }],
  layout: placeNewNode(document, entityId, position),
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

// ATTRIBUTES

export const newAttribute = (attributeId: string, name: string): AttributeDefinition => ({
  id: attributeId,
  name,
  type: "String",
  multiplicity: { min: 1, max: "one" },
  unique: false,
});

/** A list can't be unique, so a `many` multiplicity forces `unique` off.
 *  Every write goes through this, keeping the combination out of the
 *  document. */
const normalizeAttribute = (attribute: AttributeDefinition): AttributeDefinition =>
  attribute.multiplicity.max === "many" && attribute.unique
    ? { ...attribute, unique: false }
    : attribute;

export const addAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attribute: AttributeDefinition,
  index?: number,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    attributes: Array.insertAt(
      entity.attributes,
      index ?? entity.attributes.length,
      normalizeAttribute(attribute),
    ).pipe(Option.getOrElse(() => entity.attributes)),
  }));

export const replaceAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attribute: AttributeDefinition,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    attributes: Array.map(entity.attributes, (existing) =>
      existing.id === attribute.id ? normalizeAttribute(attribute) : existing,
    ),
  }));

export const deleteAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attributeId: string,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    attributes: Array.filter(entity.attributes, (attribute) => attribute.id !== attributeId),
  }));

export type MoveDirection = "Up" | "Down";

/** Swaps the item with `id` and its neighbor in `direction`; out of range
 *  moves change nothing. */
const moveById = <A extends Readonly<{ id: string }>>(
  items: ReadonlyArray<A>,
  id: string,
  direction: MoveDirection,
): ReadonlyArray<A> =>
  pipe(
    Array.findFirstIndex(items, (item) => item.id === id),
    Option.flatMap((index) => {
      const swapIndex = direction === "Up" ? index - 1 : index + 1;
      return Option.all([Array.get(items, index), Array.get(items, swapIndex)]).pipe(
        Option.map(([moving, displaced]) =>
          Array.map(items, (item, itemIndex) =>
            itemIndex === index ? displaced : itemIndex === swapIndex ? moving : item,
          ),
        ),
      );
    }),
    Option.getOrElse(() => items),
  );

export const moveAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attributeId: string,
  direction: MoveDirection,
): DomainModelDocument =>
  mapEntity(document, entityId, (entity) => ({
    ...entity,
    attributes: moveById(entity.attributes, attributeId, direction),
  }));

// ENUMS

export const addEnum = (
  document: DomainModelDocument,
  typeId: string,
  name: string,
  position: Point,
): DomainModelDocument => ({
  ...document,
  types: [...document.types, { id: typeId, kind: "Enum", name, values: [] }],
  layout: placeNewNode(document, typeId, position),
});

const mapEnum = (
  document: DomainModelDocument,
  typeId: string,
  f: (definition: EnumDefinition) => EnumDefinition,
): DomainModelDocument => ({
  ...document,
  types: Array.map(document.types, (definition) =>
    definition.id === typeId ? f(definition) : definition,
  ),
});

export const renameEnum = (
  document: DomainModelDocument,
  typeId: string,
  name: string,
): DomainModelDocument => mapEnum(document, typeId, (definition) => ({ ...definition, name }));

/** The gap between an entity card and an enum created from one of its
 *  fields. */
const NEW_ENUM_GAP = 40;

/** Creates an enum for an attribute in one step: the enum, with one blank
 *  first value, sits expanded to the right of the entity's card, and the
 *  attribute (`attribute` replaces the one with its ID) is typed by it. */
export const addEnumForAttribute = (
  document: DomainModelDocument,
  entityId: string,
  attribute: AttributeDefinition,
  typeId: string,
  valueId: string,
  name: string,
): DomainModelDocument => {
  const definition: EnumDefinition = {
    id: typeId,
    kind: "Enum",
    name,
    values: [{ id: valueId, name: "" }],
  };
  const preferred = pipe(
    Option.all([findEntity(document, entityId), findNode(document, entityId)]),
    Option.match({
      onNone: () => nextStaggerPosition(nodePositions(document.layout.nodes)),
      onSome: ([entity, node]) => {
        const rect = nodeRect(entity, node, Option.none());
        return { x: rect.x + rect.width + NEW_ENUM_GAP, y: rect.y };
      },
    }),
  );
  const { width, height } = enumRect(
    definition,
    { position: preferred, isExpanded: true },
    Option.none(),
  );
  return replaceAttribute(
    {
      ...document,
      types: [...document.types, definition],
      layout: {
        ...document.layout,
        nodes: {
          ...document.layout.nodes,
          [typeId]: {
            position: nearestFreePosition(preferred, { width, height }, cardRects(document)),
            isExpanded: true,
          },
        },
      },
    },
    entityId,
    { ...attribute, type: { typeId } },
  );
};

/** Removes an enum and its layout node. Attributes typed by it are left
 *  dangling, which a diagnostic reports; undo is the way back. */
export const deleteEnum = (document: DomainModelDocument, typeId: string): DomainModelDocument => ({
  ...document,
  types: Array.filter(document.types, (definition) => definition.id !== typeId),
  layout: {
    ...document.layout,
    nodes: Record.remove(document.layout.nodes, typeId),
  },
});

export const addEnumValue = (
  document: DomainModelDocument,
  typeId: string,
  value: EnumValue,
  index?: number,
): DomainModelDocument =>
  mapEnum(document, typeId, (definition) => ({
    ...definition,
    values: Array.insertAt(definition.values, index ?? definition.values.length, value).pipe(
      Option.getOrElse(() => definition.values),
    ),
  }));

/** Sets a value's name and description; a blank description removes it. */
export const updateEnumValue = (
  document: DomainModelDocument,
  typeId: string,
  valueId: string,
  name: string,
  description: string,
): DomainModelDocument =>
  mapEnum(document, typeId, (definition) => ({
    ...definition,
    values: Array.map(definition.values, (value) => {
      if (value.id !== valueId) {
        return value;
      }
      const { description: _previous, ...rest } = value;
      return description.trim() === ""
        ? { ...rest, name }
        : { ...rest, name, description: description.trim() };
    }),
  }));

export const deleteEnumValue = (
  document: DomainModelDocument,
  typeId: string,
  valueId: string,
): DomainModelDocument =>
  mapEnum(document, typeId, (definition) => ({
    ...definition,
    values: Array.filter(definition.values, (value) => value.id !== valueId),
  }));

export const moveEnumValue = (
  document: DomainModelDocument,
  typeId: string,
  valueId: string,
  direction: MoveDirection,
): DomainModelDocument =>
  mapEnum(document, typeId, (definition) => ({
    ...definition,
    values: moveById(definition.values, valueId, direction),
  }));

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
  nodeId: string,
  f: (node: NodeLayout) => NodeLayout,
): DomainModelDocument => ({
  ...document,
  layout: {
    ...document.layout,
    nodes: Option.match(findNode(document, nodeId), {
      onNone: () => document.layout.nodes,
      onSome: (node) => ({ ...document.layout.nodes, [nodeId]: f(node) }),
    }),
  },
});

export const moveNode = (
  document: DomainModelDocument,
  nodeId: string,
  position: Point,
): DomainModelDocument => mapNode(document, nodeId, (node) => ({ ...node, position }));

export const setExpanded = (
  document: DomainModelDocument,
  nodeId: string,
  isExpanded: boolean,
): DomainModelDocument => mapNode(document, nodeId, (node) => ({ ...node, isExpanded }));

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
    nodes: Record.map(restored.layout.nodes, (node, nodeId) =>
      pipe(
        Option.fromNullishOr(current.layout.nodes[nodeId]),
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
      attributes: [
        {
          id: "p2",
          name: "email",
          type: "String",
          multiplicity: { min: 1, max: "one" },
          unique: true,
        },
        {
          id: "p3",
          name: "displayName",
          type: "String",
          multiplicity: { min: 0, max: "one" },
          unique: false,
        },
        {
          id: "p4",
          name: "role",
          type: { typeId: "t1" },
          multiplicity: { min: 1, max: "one" },
          unique: false,
        },
      ],
    },
    {
      id: "e2",
      name: "Post",
      attributes: [
        {
          id: "p7",
          name: "title",
          type: "String",
          multiplicity: { min: 1, max: "one" },
          unique: false,
        },
        {
          id: "p8",
          name: "publishedAt",
          type: "DateTime",
          multiplicity: { min: 0, max: "one" },
          unique: false,
        },
      ],
    },
    {
      id: "e3",
      name: "Tag",
      attributes: [
        {
          id: "p10",
          name: "label",
          type: "String",
          multiplicity: { min: 1, max: "one" },
          unique: true,
        },
      ],
    },
  ],
  types: [
    {
      id: "t1",
      kind: "Enum",
      name: "Role",
      values: [
        { id: "v1", name: "reader" },
        { id: "v2", name: "author" },
        { id: "v3", name: "admin" },
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
      t1: { position: { x: 120, y: 520 }, isExpanded: false },
    },
    viewport: DEFAULT_VIEWPORT,
  },
};
