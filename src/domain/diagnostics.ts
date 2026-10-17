import { Array, Data, Option, Record, pipe } from "effect";

import { findEntity, findProperty, type RelationshipEnd } from "./document";
import type { DomainModelDocument, EntityDefinition, RelationshipDefinition } from "./schema";

// Diagnostics are derived from the document on every render and never stored
// in the Model, so a plain tagged enum is enough; no Schema is needed.

export type Diagnostic = Data.TaggedEnum<{
  DuplicateEntityName: { readonly entityId: string; readonly name: string };
  DuplicatePropertyName: {
    readonly entityId: string;
    readonly propertyId: string;
    readonly name: string;
  };
  DanglingEntityReference: {
    readonly relationshipId: string;
    readonly end: RelationshipEnd;
    readonly entityId: string;
  };
  DanglingPropertyReference: {
    readonly relationshipId: string;
    readonly end: RelationshipEnd;
    readonly propertyId: string;
  };
  TypeMismatch: {
    readonly relationshipId: string;
    readonly sourceType: string;
    readonly targetType: string;
  };
}>;
export const Diagnostic = Data.taggedEnum<Diagnostic>();

const normalizeName = (name: string): string => name.trim().toLowerCase();

/** Groups items by a normalized name and keeps only groups with more than one
 *  member. Blank names are never considered duplicates. */
const duplicatesBy = <A>(items: ReadonlyArray<A>, toName: (item: A) => string): ReadonlyArray<A> =>
  pipe(
    items,
    Array.filter((item) => normalizeName(toName(item)) !== ""),
    Array.groupBy((item) => normalizeName(toName(item))),
    Record.values,
    Array.filter((group) => group.length > 1),
    Array.flatten,
  );

const duplicateEntityNames = (document: DomainModelDocument): ReadonlyArray<Diagnostic> =>
  Array.map(
    duplicatesBy(document.entities, (entity) => entity.name),
    (entity) => Diagnostic.DuplicateEntityName({ entityId: entity.id, name: entity.name }),
  );

const duplicatePropertyNames = (entity: EntityDefinition): ReadonlyArray<Diagnostic> =>
  Array.map(
    duplicatesBy(entity.properties, (property) => property.name),
    (property) =>
      Diagnostic.DuplicatePropertyName({
        entityId: entity.id,
        propertyId: property.id,
        name: property.name,
      }),
  );

const relationshipDiagnostics = (
  document: DomainModelDocument,
  relationship: RelationshipDefinition,
): ReadonlyArray<Diagnostic> => {
  const maybeSource = findEntity(document, relationship.sourceEntityId);
  const maybeTarget = findEntity(document, relationship.targetEntityId);

  const danglingEntities = [
    ...(Option.isNone(maybeSource)
      ? [
          Diagnostic.DanglingEntityReference({
            relationshipId: relationship.id,
            end: "Source",
            entityId: relationship.sourceEntityId,
          }),
        ]
      : []),
    ...(Option.isNone(maybeTarget)
      ? [
          Diagnostic.DanglingEntityReference({
            relationshipId: relationship.id,
            end: "Target",
            entityId: relationship.targetEntityId,
          }),
        ]
      : []),
  ];

  const checkProperty = (
    maybeEntity: Option.Option<EntityDefinition>,
    maybePropertyId: string | undefined,
    end: RelationshipEnd,
  ): ReadonlyArray<Diagnostic> =>
    Option.isSome(maybeEntity) &&
    maybePropertyId !== undefined &&
    Option.isNone(findProperty(maybeEntity.value, maybePropertyId))
      ? [
          Diagnostic.DanglingPropertyReference({
            relationshipId: relationship.id,
            end,
            propertyId: maybePropertyId,
          }),
        ]
      : [];

  const maybeSourceProperty = Option.flatMap(maybeSource, (source) =>
    Option.flatMap(Option.fromNullishOr(relationship.sourcePropertyId), (id) =>
      findProperty(source, id),
    ),
  );
  const maybeTargetProperty = Option.flatMap(maybeTarget, (target) =>
    Option.flatMap(Option.fromNullishOr(relationship.targetPropertyId), (id) =>
      findProperty(target, id),
    ),
  );

  const typeMismatch = pipe(
    Option.all([maybeSourceProperty, maybeTargetProperty]),
    Option.filter(([source, target]) => source.type !== target.type),
    Option.match({
      onNone: () => [],
      onSome: ([source, target]) => [
        Diagnostic.TypeMismatch({
          relationshipId: relationship.id,
          sourceType: source.type,
          targetType: target.type,
        }),
      ],
    }),
  );

  return [
    ...danglingEntities,
    ...checkProperty(maybeSource, relationship.sourcePropertyId, "Source"),
    ...checkProperty(maybeTarget, relationship.targetPropertyId, "Target"),
    ...typeMismatch,
  ];
};

/** Live, non-blocking validation of a document. */
export const diagnose = (document: DomainModelDocument): ReadonlyArray<Diagnostic> => [
  ...duplicateEntityNames(document),
  ...Array.flatMap(document.entities, duplicatePropertyNames),
  ...Array.flatMap(document.relationships, (relationship) =>
    relationshipDiagnostics(document, relationship),
  ),
];

// QUERIES

export const forEntity = (
  diagnostics: ReadonlyArray<Diagnostic>,
  entityId: string,
): ReadonlyArray<Diagnostic> =>
  Array.filter(
    diagnostics,
    (diagnostic) =>
      (diagnostic._tag === "DuplicateEntityName" || diagnostic._tag === "DuplicatePropertyName") &&
      diagnostic.entityId === entityId,
  );

export const forProperty = (
  diagnostics: ReadonlyArray<Diagnostic>,
  propertyId: string,
): ReadonlyArray<Diagnostic> =>
  Array.filter(
    diagnostics,
    (diagnostic) =>
      diagnostic._tag === "DuplicatePropertyName" && diagnostic.propertyId === propertyId,
  );

export const forRelationship = (
  diagnostics: ReadonlyArray<Diagnostic>,
  relationshipId: string,
): ReadonlyArray<Diagnostic> =>
  Array.filter(
    diagnostics,
    (diagnostic) =>
      (diagnostic._tag === "DanglingEntityReference" ||
        diagnostic._tag === "DanglingPropertyReference" ||
        diagnostic._tag === "TypeMismatch") &&
      diagnostic.relationshipId === relationshipId,
  );

export const describe = (diagnostic: Diagnostic): string =>
  Diagnostic.$match(diagnostic, {
    DuplicateEntityName: ({ name }) => `Duplicate entity name “${name}”`,
    DuplicatePropertyName: ({ name }) => `Duplicate property name “${name}”`,
    DanglingEntityReference: ({ end, entityId }) => `${end} entity “${entityId}” does not exist`,
    DanglingPropertyReference: ({ end, propertyId }) =>
      `${end} key “${propertyId}” no longer exists`,
    TypeMismatch: ({ sourceType, targetType }) => `Key types differ: ${sourceType} → ${targetType}`,
  });
