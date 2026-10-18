import { Schema } from "effect";

// AST

export const PropertyType = Schema.Literals([
  "String",
  "Number",
  "Boolean",
  "Date",
  "UUID",
  "Literal",
  "Json",
]);
export type PropertyType = typeof PropertyType.Type;

export const PROPERTY_TYPES: ReadonlyArray<PropertyType> = PropertyType.literals;

export const PropertyDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: PropertyType,
  literalOptions: Schema.optional(Schema.Array(Schema.String)),
  isOptional: Schema.Boolean,
  isNullable: Schema.Boolean,
  description: Schema.optional(Schema.String),
});
export type PropertyDefinition = typeof PropertyDefinition.Type;

export const EntityDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  properties: Schema.Array(PropertyDefinition),
});
export type EntityDefinition = typeof EntityDefinition.Type;

export const Multiplicity = Schema.Struct({
  min: Schema.Literals([0, 1]),
  max: Schema.Literals(["one", "many"]),
});
export type Multiplicity = typeof Multiplicity.Type;

export const AssociationEnd = Schema.Struct({
  entityId: Schema.String,
  role: Schema.optional(Schema.String),
  multiplicity: Multiplicity,
});
export type AssociationEnd = typeof AssociationEnd.Type;

/** Which of an association's two ends: `0` is the end it was drawn from. */
export const EndIndex = Schema.Literals([0, 1]);
export type EndIndex = typeof EndIndex.Type;

export const AssociationDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  ends: Schema.Tuple([AssociationEnd, AssociationEnd]),
});
export type AssociationDefinition = typeof AssociationDefinition.Type;

// LAYOUT

export const Point = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
});
export type Point = typeof Point.Type;

export const NodeLayout = Schema.Struct({
  position: Point,
  isExpanded: Schema.Boolean,
});
export type NodeLayout = typeof NodeLayout.Type;

export const ViewportLayout = Schema.Struct({
  pan: Point,
  zoom: Schema.Number,
});
export type ViewportLayout = typeof ViewportLayout.Type;

export const DomainLayout = Schema.Struct({
  nodes: Schema.Record(Schema.String, NodeLayout),
  viewport: ViewportLayout,
});
export type DomainLayout = typeof DomainLayout.Type;

// DOCUMENT

export const DomainModelDocument = Schema.Struct({
  version: Schema.Literal("1.0.0"),
  name: Schema.String,
  entities: Schema.Array(EntityDefinition),
  associations: Schema.Array(AssociationDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;

export const DomainModelDocumentJsonString = Schema.fromJsonString(
  Schema.toCodecJson(DomainModelDocument),
);
