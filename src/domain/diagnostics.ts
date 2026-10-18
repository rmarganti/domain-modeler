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
  DuplicateAttributeName: {
    readonly entityId: string;
    readonly attributeId: string;
    readonly name: string;
  };
  UniqueOnList: { readonly entityId: string; readonly attributeId: string };
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

const duplicateAttributeNames = (entity: EntityDefinition): ReadonlyArray<Diagnostic> =>
  Array.map(
    duplicatesBy(entity.attributes, (attribute) => attribute.name),
    (attribute) =>
      Diagnostic.DuplicateAttributeName({
        entityId: entity.id,
        attributeId: attribute.id,
        name: attribute.name,
      }),
  );

const uniqueOnLists = (entity: EntityDefinition): ReadonlyArray<Diagnostic> =>
  pipe(
    entity.attributes,
    Array.filter((attribute) => attribute.unique && attribute.multiplicity.max === "many"),
    Array.map((attribute) =>
      Diagnostic.UniqueOnList({ entityId: entity.id, attributeId: attribute.id }),
    ),
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

/** A name an entity can be navigated by: one of its attributes, or the role
 *  of the far end of an association touching it. */
type Member =
  | Readonly<{ _tag: "Attribute"; name: string }>
  | Readonly<{ _tag: "Role"; name: string; associationId: string; endIndex: EndIndex }>;

const members = (
  document: DomainModelDocument,
  entity: EntityDefinition,
): ReadonlyArray<Member> => [
  ...Array.map(entity.attributes, (attribute): Member => ({
    _tag: "Attribute",
    name: attribute.name,
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
  ...Array.flatMap(document.entities, duplicateAttributeNames),
  ...Array.flatMap(document.entities, uniqueOnLists),
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
      (diagnostic._tag === "DuplicateEntityName" ||
        diagnostic._tag === "DuplicateAttributeName" ||
        diagnostic._tag === "UniqueOnList") &&
      diagnostic.entityId === entityId,
  );

export const forAttribute = (
  diagnostics: ReadonlyArray<Diagnostic>,
  attributeId: string,
): ReadonlyArray<Diagnostic> =>
  Array.filter(
    diagnostics,
    (diagnostic) =>
      (diagnostic._tag === "DuplicateAttributeName" || diagnostic._tag === "UniqueOnList") &&
      diagnostic.attributeId === attributeId,
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
    DuplicateAttributeName: ({ name }) => `Duplicate field name “${name}”`,
    UniqueOnList: () => "A list field can't be unique",
    DanglingEntityReference: ({ endIndex, entityId }) =>
      `Entity “${entityId}” at end ${endIndex + 1} does not exist`,
    RoleClash: ({ name, entityName }) => `Role “${name}” clashes on ${entityName}`,
  });
