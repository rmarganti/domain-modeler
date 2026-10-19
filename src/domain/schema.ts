import { Schema, SchemaTransformation, Struct } from "effect";

// Descriptions flow into schema/domain-model.schema.json, which agents and
// editors read to learn the file format. Keep them about meaning, not shape.

// AST

export const Multiplicity = Schema.Struct({
  min: Schema.Literals([0, 1]).annotate({ description: "0 means optional, 1 means required." }),
  max: Schema.Literals(["one", "many"]).annotate({ description: '"many" makes it a list.' }),
}).annotate({
  identifier: "Multiplicity",
  description:
    "How many may exist: 0..1, 1, 0..* or 1..*. On an association end, it counts that end's entity per one of the other end's entity.",
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
]).annotate({ identifier: "Primitive", description: "A built-in attribute type." });
export type Primitive = typeof Primitive.Type;

export const PRIMITIVES: ReadonlyArray<Primitive> = Primitive.literals;

/** A reference to an entry of the document's `types`. */
export const TypeRef = Schema.Struct({
  typeId: Schema.String.annotate({ description: "The ID of an enum in `types`." }),
}).annotate({ identifier: "TypeRef", description: "An attribute type that points at an enum." });
export type TypeRef = typeof TypeRef.Type;

export const AttributeType = Schema.Union([Primitive, TypeRef]);
export type AttributeType = typeof AttributeType.Type;

export const isTypeRef = (type: AttributeType): type is TypeRef => typeof type !== "string";

export const AttributeDefinition = Schema.Struct({
  id: Schema.String.annotate({ description: 'Unique in the document, shaped "p<number>".' }),
  name: Schema.String.annotate({
    description:
      "camelCase by convention. Unique within its entity, including the roles the entity reaches through associations.",
  }),
  description: Schema.optional(Schema.String),
  type: AttributeType,
  multiplicity: Multiplicity,
  unique: Schema.Boolean.annotate({
    description: "A business key. Must be false when the max is many.",
  }),
}).annotate({
  identifier: "Attribute",
  description:
    "A field on an entity. Never model IDs or foreign keys as attributes: identity is implicit, and links between entities are associations.",
});
export type AttributeDefinition = typeof AttributeDefinition.Type;

export const EntityDefinition = Schema.Struct({
  id: Schema.String.annotate({ description: 'Unique in the document, shaped "e<number>".' }),
  name: Schema.String.annotate({
    description: "PascalCase by convention. Shares a case-insensitive namespace with enum names.",
  }),
  description: Schema.optional(Schema.String),
  attributes: Schema.Array(AttributeDefinition),
}).annotate({ identifier: "Entity", description: "A thing in the domain with its own identity." });
export type EntityDefinition = typeof EntityDefinition.Type;

export const EnumValue = Schema.Struct({
  id: Schema.String.annotate({ description: 'Unique in the document, shaped "v<number>".' }),
  name: Schema.String.annotate({ description: "Unique within its enum." }),
  description: Schema.optional(Schema.String),
}).annotate({ identifier: "EnumValue" });
export type EnumValue = typeof EnumValue.Type;

export const EnumDefinition = Schema.Struct({
  id: Schema.String.annotate({ description: 'Unique in the document, shaped "t<number>".' }),
  kind: Schema.Literal("Enum"), // discriminator: value objects may join a union later
  name: Schema.String.annotate({
    description: "PascalCase by convention. Shares a case-insensitive namespace with entity names.",
  }),
  description: Schema.optional(Schema.String),
  values: Schema.Array(EnumValue).annotate({ description: "Should have at least one value." }),
}).annotate({ identifier: "Enum", description: "A closed set of named values." });
export type EnumDefinition = typeof EnumDefinition.Type;

export const AssociationEnd = Schema.Struct({
  entityId: Schema.String.annotate({ description: "The ID of an entity in `entities`." }),
  role: Schema.optional(Schema.String).annotate({
    description:
      "What the other end's entity calls this end's entity. Leave it out to derive it: the camelCased entity name, pluralized when the max is many.",
  }),
  multiplicity: Multiplicity,
}).annotate({ identifier: "AssociationEnd" });
export type AssociationEnd = typeof AssociationEnd.Type;

/** Which of an association's two ends: `0` is the end it was drawn from. */
export const EndIndex = Schema.Literals([0, 1]);
export type EndIndex = typeof EndIndex.Type;

export const AssociationDefinition = Schema.Struct({
  id: Schema.String.annotate({ description: 'Unique in the document, shaped "r<number>".' }),
  name: Schema.optional(Schema.String).annotate({
    description: "A display verb only. It carries no direction.",
  }),
  description: Schema.optional(Schema.String),
  ends: Schema.Tuple([AssociationEnd, AssociationEnd]),
}).annotate({
  identifier: "Association",
  description:
    "An undirected link between two entities, read UML-style: in `User 1 ── 0..* Post`, a User has many Posts. Never links attributes.",
});
export type AssociationDefinition = typeof AssociationDefinition.Type;

// LAYOUT

export const Point = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
}).annotate({ identifier: "Point" });
export type Point = typeof Point.Type;

export const NodeLayout = Schema.Struct({
  position: Point,
  isExpanded: Schema.Boolean,
}).annotate({ identifier: "NodeLayout" });
export type NodeLayout = typeof NodeLayout.Type;

export const ViewportLayout = Schema.Struct({
  pan: Point,
  zoom: Schema.Finite,
}).annotate({ identifier: "ViewportLayout" });
export type ViewportLayout = typeof ViewportLayout.Type;

/** `nodes` is keyed by entity or type ID: every card on the canvas has one. */
export const DomainLayout = Schema.Struct({
  nodes: Schema.Record(Schema.String, NodeLayout).annotate({
    description: "Card positions keyed by entity or enum ID.",
  }),
  viewport: ViewportLayout,
}).annotate({
  identifier: "Layout",
  description:
    "Canvas presentation only, with no domain meaning. The editor gives new cards a position and drops stale ones, so tools can leave this alone.",
});
export type DomainLayout = typeof DomainLayout.Type;

// DOCUMENT

export const DomainModelDocument = Schema.Struct({
  version: Schema.Literal("1.0.0"),
  name: Schema.String,
  entities: Schema.Array(EntityDefinition),
  types: Schema.Array(EnumDefinition).annotate({ description: "Enums, referenced by TypeRef." }),
  associations: Schema.Array(AssociationDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;

// FILE

/** Where the published JSON Schema lives. It tracks `main`, matching the
 *  format's change-in-place policy. */
export const SCHEMA_URL =
  "https://raw.githubusercontent.com/rmarganti/domain-modeler/main/schema/domain-model.schema.json";

/** A document as it sits on disk: `$schema` points editors and agents at the
 *  format. Reading ignores it, and saving always writes `SCHEMA_URL`. */
export const DomainModelFile = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  ...DomainModelDocument.fields,
}).annotate({
  title: "Domain Model",
  description:
    "A Domain Modeler document: entities, enums and the associations between entities. New IDs take the next unused number for their prefix.",
});

export const DomainModelDocumentJsonString = Schema.fromJsonString(
  Schema.toCodecJson(DomainModelFile).pipe(
    Schema.decodeTo(
      DomainModelDocument,
      SchemaTransformation.transform({
        decode: (file) => Struct.omit(file, ["$schema"]),
        encode: (document) => ({ $schema: SCHEMA_URL, ...document }),
      }),
    ),
  ),
);
