import { Schema } from "effect";

export const DomainModelId = Schema.String.pipe(Schema.brand("DomainModelId"));
export type DomainModelId = typeof DomainModelId.Type;
export const EntityId = Schema.String.pipe(Schema.brand("EntityId"));
export type EntityId = typeof EntityId.Type;
export const AttributeId = Schema.String.pipe(Schema.brand("AttributeId"));
export type AttributeId = typeof AttributeId.Type;
export const EnumDefinitionId = Schema.String.pipe(Schema.brand("EnumDefinitionId"));
export type EnumDefinitionId = typeof EnumDefinitionId.Type;
export const EnumValueId = Schema.String.pipe(Schema.brand("EnumValueId"));
export type EnumValueId = typeof EnumValueId.Type;
export const AssociationId = Schema.String.pipe(Schema.brand("AssociationId"));
export type AssociationId = typeof AssociationId.Type;
export const AssociationEndId = Schema.String.pipe(Schema.brand("AssociationEndId"));
export type AssociationEndId = typeof AssociationEndId.Type;

export const PrimitiveType = Schema.Union([
  Schema.Literal("String"),
  Schema.Literal("Integer"),
  Schema.Literal("Decimal"),
  Schema.Literal("Boolean"),
  Schema.Literal("Date"),
  Schema.Literal("DateTime"),
  Schema.Literal("Json"),
]).annotate({ identifier: "PrimitiveType" });
export type PrimitiveType = typeof PrimitiveType.Type;

export const UpperBound = Schema.Union([
  Schema.Literal("one"),
  Schema.Literal("many"),
]).annotate({ identifier: "UpperBound" });
export type UpperBound = typeof UpperBound.Type;

export const DomainModel = Schema.Struct({
  id: DomainModelId,
  name: Schema.String,
  version: Schema.String,
}).annotate({ identifier: "DomainModel" });
export type DomainModel = typeof DomainModel.Type;

export const Entity = Schema.Struct({
  id: EntityId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  modelId: DomainModelId,
}).annotate({ identifier: "Entity", description: "Entity and enum names share a case-insensitive namespace within the model." });
export type Entity = typeof Entity.Type;

export const Attribute = Schema.Struct({
  id: AttributeId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  primitiveType: Schema.optional(PrimitiveType),
  unique: Schema.Boolean,
  min: Schema.Int,
  max: UpperBound,
  ownerId: EntityId.annotate({ description: "Attributes are ordered within their entity." }),
  enumTypeId: Schema.optional(EnumDefinitionId.annotate({ description: "Exactly one of Attribute.primitiveType and enumType must be present." })),
}).annotate({ identifier: "Attribute", description: "Exactly one of primitiveType and enumType is present. min is 0 or 1; max is one or many. unique must be false for many-valued attributes. Identity is implicit, never an ID field." });
export type Attribute = typeof Attribute.Type;

export const EnumDefinition = Schema.Struct({
  id: EnumDefinitionId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  modelId: DomainModelId,
}).annotate({ identifier: "EnumDefinition", description: "Entity and enum names share a case-insensitive namespace within the model." });
export type EnumDefinition = typeof EnumDefinition.Type;

export const EnumValue = Schema.Struct({
  id: EnumValueId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  definitionId: EnumDefinitionId.annotate({ description: "Values are ordered and names are unique within the enum." }),
}).annotate({ identifier: "EnumValue" });
export type EnumValue = typeof EnumValue.Type;

export const Association = Schema.Struct({
  id: AssociationId,
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  modelId: DomainModelId,
}).annotate({ identifier: "Association" });
export type Association = typeof Association.Type;

export const AssociationEnd = Schema.Struct({
  id: AssociationEndId,
  role: Schema.optional(Schema.String),
  min: Schema.Int,
  max: UpperBound,
  associationId: AssociationId.annotate({ description: "Exactly two ordered ends per association. The canvas cannot express a multiplicity of exactly 2." }),
  entityId: EntityId.annotate({ description: "A self-association has both ends targeting the same entity." }),
}).annotate({ identifier: "AssociationEnd", description: "An end belongs to exactly one association and targets one entity. min is 0 or 1. An absent role is derived from the target entity name and multiplicity." });
export type AssociationEnd = typeof AssociationEnd.Type;
