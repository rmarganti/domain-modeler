import { Array, Data, Option, Record, pipe } from "effect";

import { findEntity } from "./document";
import { effectiveRole } from "./naming";
import type {
  AssociationDefinition,
  DomainModelDocument,
  EndIndex,
  EntityDefinition,
} from "./schema";

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
    readonly associationId: string;
    readonly endIndex: EndIndex;
    readonly entityId: string;
  };
  RoleClash: {
    readonly associationId: string;
    readonly endIndex: EndIndex;
    readonly entityId: string;
    readonly entityName: string;
    readonly name: string;
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

const END_INDEXES: ReadonlyArray<EndIndex> = [0, 1];

const danglingEntityReferences = (
  document: DomainModelDocument,
  association: AssociationDefinition,
): ReadonlyArray<Diagnostic> =>
  Array.getSomes(
    Array.map(END_INDEXES, (endIndex) => {
      const { entityId } = association.ends[endIndex];
      return Option.isNone(findEntity(document, entityId))
        ? Option.some(
            Diagnostic.DanglingEntityReference({
              associationId: association.id,
              endIndex,
              entityId,
            }),
          )
        : Option.none();
    }),
  );

/** A name an entity can be navigated by: one of its properties, or the role
 *  of the far end of an association touching it. */
type Member =
  | Readonly<{ _tag: "Property"; name: string }>
  | Readonly<{ _tag: "Role"; name: string; associationId: string; endIndex: EndIndex }>;

const members = (
  document: DomainModelDocument,
  entity: EntityDefinition,
): ReadonlyArray<Member> => [
  ...Array.map(entity.properties, (property): Member => ({
    _tag: "Property",
    name: property.name,
  })),
  ...Array.flatMap(document.associations, (association) =>
    Array.getSomes(
      Array.map(END_INDEXES, (endIndex) => {
        // NOTE: the entity at the near end reaches the far end by the far
        // end's role, so a self association gives the entity both roles.
        const nearIndex: EndIndex = endIndex === 0 ? 1 : 0;
        return association.ends[nearIndex].entityId === entity.id
          ? Option.map(effectiveRole(document, association, endIndex), (name): Member => ({
              _tag: "Role",
              name,
              associationId: association.id,
              endIndex,
            }))
          : Option.none();
      }),
    ),
  ),
];

const roleClashes = (
  document: DomainModelDocument,
  entity: EntityDefinition,
): ReadonlyArray<Diagnostic> =>
  Array.flatMap(
    duplicatesBy(members(document, entity), (member) => member.name),
    (member) =>
      member._tag === "Role"
        ? [
            Diagnostic.RoleClash({
              associationId: member.associationId,
              endIndex: member.endIndex,
              entityId: entity.id,
              entityName: entity.name,
              name: member.name,
            }),
          ]
        : [],
  );

/** Live, non-blocking validation of a document. */
export const diagnose = (document: DomainModelDocument): ReadonlyArray<Diagnostic> => [
  ...duplicateEntityNames(document),
  ...Array.flatMap(document.entities, duplicatePropertyNames),
  ...Array.flatMap(document.associations, (association) =>
    danglingEntityReferences(document, association),
  ),
  ...Array.flatMap(document.entities, (entity) => roleClashes(document, entity)),
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

export const forAssociation = (
  diagnostics: ReadonlyArray<Diagnostic>,
  associationId: string,
): ReadonlyArray<Diagnostic> =>
  Array.filter(
    diagnostics,
    (diagnostic) =>
      (diagnostic._tag === "DanglingEntityReference" || diagnostic._tag === "RoleClash") &&
      diagnostic.associationId === associationId,
  );

export const describe = (diagnostic: Diagnostic): string =>
  Diagnostic.$match(diagnostic, {
    DuplicateEntityName: ({ name }) => `Duplicate entity name “${name}”`,
    DuplicatePropertyName: ({ name }) => `Duplicate property name “${name}”`,
    DanglingEntityReference: ({ endIndex, entityId }) =>
      `Entity “${entityId}” at end ${endIndex + 1} does not exist`,
    RoleClash: ({ name, entityName }) => `Role “${name}” clashes on ${entityName}`,
  });
