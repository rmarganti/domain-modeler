import { Option } from "effect";

import { attributeTypeLabel, findEntity, findEnum } from "./document";
import {
  isTypeRef,
  type AssociationDefinition,
  type AttributeDefinition,
  type DomainModelDocument,
  type EntityDefinition,
  type Multiplicity,
} from "./schema";

// Renders a document as a Mermaid entity-relationship diagram.

const INDENT = "    ";

/** Mermaid strings can't contain double quotes, so they become single ones. */
const quote = (text: string): string => `"${text.replaceAll('"', "'")}"`;

/** Names Mermaid can't read bare, such as ones with spaces, are quoted. */
const entityName = (entity: EntityDefinition): string =>
  /^[A-Za-z_][A-Za-z0-9_-]*$/.test(entity.name) ? entity.name : quote(entity.name);

/** Attribute types and names are bare words, so other characters become `_`. */
const word = (text: string): string => text.replaceAll(/[^A-Za-z0-9_-]/g, "_");

const typeOf = (document: DomainModelDocument, attribute: AttributeDefinition): string =>
  `${word(attributeTypeLabel(document, attribute.type))}${attribute.multiplicity.max === "many" ? "[]" : ""}`;

/** Mermaid has no enums, so an enum attribute lists the allowed values. */
const enumValuesOf = (
  document: DomainModelDocument,
  attribute: AttributeDefinition,
): Option.Option<string> =>
  isTypeRef(attribute.type)
    ? findEnum(document, attribute.type.typeId).pipe(
        Option.filter((definition) => definition.values.length > 0),
        Option.map((definition) => definition.values.map((value) => value.name).join(" | ")),
      )
    : Option.none();

const commentOf = (
  document: DomainModelDocument,
  attribute: AttributeDefinition,
): ReadonlyArray<string> => {
  const parts = [
    ...(attribute.multiplicity.min === 0 ? ["optional"] : []),
    ...Option.toArray(enumValuesOf(document, attribute)),
  ];
  return parts.length === 0 ? [] : [quote(parts.join(" · "))];
};

const attributeLine = (document: DomainModelDocument, attribute: AttributeDefinition): string =>
  INDENT +
  INDENT +
  [
    typeOf(document, attribute),
    word(attribute.name),
    ...(attribute.unique ? ["UK"] : []),
    ...commentOf(document, attribute),
  ].join(" ");

const entityBlock = (
  document: DomainModelDocument,
  entity: EntityDefinition,
): ReadonlyArray<string> =>
  entity.attributes.length === 0
    ? [`${INDENT}${entityName(entity)}`]
    : [
        `${INDENT}${entityName(entity)} {`,
        ...entity.attributes.map((attribute) => attributeLine(document, attribute)),
        `${INDENT}}`,
      ];

/** Crow's-foot markers, read outward from the line: `|` exactly, `o` zero, `{`/`}` many. */
const leftMarker = ({ min, max }: Multiplicity): string =>
  `${max === "many" ? "}" : "|"}${min === 0 ? "o" : "|"}`;
const rightMarker = ({ min, max }: Multiplicity): string =>
  `${min === 0 ? "o" : "|"}${max === "many" ? "{" : "|"}`;

/** Associations whose ends no longer resolve are left out. */
const relationshipLine = (
  document: DomainModelDocument,
  association: AssociationDefinition,
): Option.Option<string> => {
  const [from, to] = association.ends;
  return Option.all([findEntity(document, from.entityId), findEntity(document, to.entityId)]).pipe(
    Option.map(
      ([fromEntity, toEntity]) =>
        `${INDENT}${entityName(fromEntity)} ${leftMarker(from.multiplicity)}--${rightMarker(to.multiplicity)} ${entityName(toEntity)} : ${quote(association.name ?? "")}`,
    ),
  );
};

export const toMermaid = (document: DomainModelDocument): string =>
  [
    "erDiagram",
    ...document.entities.flatMap((entity) => entityBlock(document, entity)),
    ...document.associations.flatMap((association) =>
      Option.toArray(relationshipLine(document, association)),
    ),
  ].join("\n");
