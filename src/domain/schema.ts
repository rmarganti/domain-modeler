import { Schema } from "effect";

// AST

export const Multiplicity = Schema.Struct({
  min: Schema.Literals([0, 1]),
  max: Schema.Literals(["one", "many"]),
});
export type Multiplicity = typeof Multiplicity.Type;

export const Primitive = Schema.Literals([
  "String",
  "Integer",
  "Decimal",
  "Boolean",
  "Date",
  "DateTime",
  "Json",
  "Literal", // temporary: removed in part 5
]);
export type Primitive = typeof Primitive.Type;

export const PRIMITIVES: ReadonlyArray<Primitive> = Primitive.literals;

export const AttributeDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  type: Primitive,
  literalOptions: Schema.optional(Schema.Array(Schema.String)), // temporary: removed in part 5
  multiplicity: Multiplicity,
  unique: Schema.Boolean,
});
export type AttributeDefinition = typeof AttributeDefinition.Type;

export const EntityDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  attributes: Schema.Array(AttributeDefinition),
});
export type EntityDefinition = typeof EntityDefinition.Type;

export const EnumValue = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
export type EnumValue = typeof EnumValue.Type;

export const EnumDefinition = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("Enum"), // discriminator: value objects may join a union later
  name: Schema.String,
  description: Schema.optional(Schema.String),
  values: Schema.Array(EnumValue),
});
export type EnumDefinition = typeof EnumDefinition.Type;

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

/** `nodes` is keyed by entity or type ID: every card on the canvas has one. */
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
  types: Schema.Array(EnumDefinition),
  associations: Schema.Array(AssociationDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;

export const DomainModelDocumentJsonString = Schema.fromJsonString(
  Schema.toCodecJson(DomainModelDocument),
);
