import { Array, Option, pipe } from "effect";

import { findEntity } from "./document";
import { effectiveRole, referenceFieldName, toCamelCase, toPascalCase } from "./naming";
import {
  isTypeRef,
  type AssociationDefinition,
  type AttributeDefinition,
  type AttributeType,
  type DomainModelDocument,
  type EndIndex,
  type EntityDefinition,
  type EnumDefinition,
  type Multiplicity,
  type Primitive,
} from "./schema";

// Renders a document as TypeScript declaring Effect Schema (v4) schemas for
// in-memory values. Entity IDs come first, then enums, then entities, so no
// declaration refers to one below it. Associations become ID references.

const INDENT = "  ";

const string = (text: string): string => JSON.stringify(text);

const PRIMITIVES: Record<Primitive, string> = {
  String: "Schema.String",
  Integer: "Schema.Int",
  Decimal: "Schema.Finite",
  Boolean: "Schema.Boolean",
  Date: "Schema.Date",
  DateTime: "Schema.DateTimeUtc",
  Json: "Schema.Json",
};

// NAMES

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A name that is already an identifier is kept; any other is rewritten. */
const identifier = (name: string, rewrite: (name: string) => string, fallback: string): string => {
  if (IDENTIFIER.test(name)) return name;
  const rewritten = rewrite(name);
  return rewritten === "" ? fallback : /^\d/.test(rewritten) ? `_${rewritten}` : rewritten;
};

/** Appends 2, 3, … to a name that is already taken. */
const claim = (taken: Set<string>, name: string): string => {
  let candidate = name;
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${name}${suffix}`;
  taken.add(candidate);
  return candidate;
};

/** Top-level names, keyed by entity or enum ID. */
type Names = Readonly<{
  schemas: ReadonlyMap<string, string>;
  ids: ReadonlyMap<string, string>;
}>;

const namesOf = (document: DomainModelDocument): Names => {
  const taken = new Set(["Schema"]);
  const schemas = new Map<string, string>();
  for (const entity of document.entities)
    schemas.set(entity.id, claim(taken, identifier(entity.name, toPascalCase, "Entity")));
  for (const definition of document.types)
    schemas.set(definition.id, claim(taken, identifier(definition.name, toPascalCase, "Enum")));
  const ids = new Map<string, string>();
  for (const entity of document.entities)
    ids.set(entity.id, claim(taken, `${schemas.get(entity.id)}Id`));
  return { schemas, ids };
};

const fieldName = (name: string): string => identifier(name, toCamelCase, "field");

// FIELDS

type Field = Readonly<{ name: string; schema: string; comments: ReadonlyArray<string> }>;

/** Wraps one value's schema for how many there may be. The description goes
 *  inside `optional`, on the value itself. */
const fieldSchema = (
  schema: string,
  { min, max }: Multiplicity,
  description: string | undefined,
): string => {
  const values =
    max === "many" ? `Schema.${min === 1 ? "NonEmptyArray" : "Array"}(${schema})` : schema;
  const described =
    description === undefined
      ? values
      : `${values}.annotate({ description: ${string(description)} })`;
  return min === 0 && max === "one" ? `Schema.optional(${described})` : described;
};

/** A dangling enum reference accepts anything rather than failing to compile. */
const typeSchema = (names: Names, type: AttributeType): string =>
  isTypeRef(type) ? (names.schemas.get(type.typeId) ?? "Schema.Unknown") : PRIMITIVES[type];

const attributeField = (names: Names, attribute: AttributeDefinition): Field => ({
  name: fieldName(attribute.name),
  schema: fieldSchema(
    typeSchema(names, attribute.type),
    attribute.multiplicity,
    attribute.description,
  ),
  comments: [
    ...(attribute.unique ? ["unique"] : []),
    ...(attribute.type === "Date" ? ["date only"] : []),
  ],
});

/** Which end an association's reference points at: the "one" side of a
 *  one-to-many, else the end it was drawn to. The other end holds it. */
const referencedEnd = ([from, to]: AssociationDefinition["ends"]): EndIndex =>
  from.multiplicity.max === "one" && to.multiplicity.max === "many" ? 0 : 1;

type Reference = Readonly<{ holderId: string; field: Field }>;

/** Associations whose ends no longer resolve are left out. */
const referenceOf = (
  document: DomainModelDocument,
  names: Names,
  association: AssociationDefinition,
): Option.Option<Reference> => {
  const index = referencedEnd(association.ends);
  const end = association.ends[index];
  const holder = association.ends[index === 0 ? 1 : 0];
  return Option.all([
    findEntity(document, holder.entityId),
    effectiveRole(document, association, index),
    Option.fromNullishOr(names.ids.get(end.entityId)),
  ]).pipe(
    Option.map(([, role, idName]) => ({
      holderId: holder.entityId,
      field: {
        name: fieldName(referenceFieldName(role, end.multiplicity)),
        schema: fieldSchema(idName, end.multiplicity, association.description),
        comments: [],
      },
    })),
  );
};

/** Field names clash-free within the entity, `id` first. */
const uniqueFields = (fields: ReadonlyArray<Field>): ReadonlyArray<Field> => {
  const taken = new Set<string>();
  return fields.map((field) => ({ ...field, name: claim(taken, field.name) }));
};

const fieldLine = ({ name, schema, comments }: Field): string =>
  `${INDENT}${name}: ${schema},${comments.length === 0 ? "" : ` // ${comments.join(", ")}`}`;

// DECLARATIONS

const annotations = (name: string, description: string | undefined): string =>
  `.annotate({ identifier: ${string(name)}${description === undefined ? "" : `, description: ${string(description)}`} })`;

const typeAlias = (name: string): string => `export type ${name} = typeof ${name}.Type;`;

const idBlock = (name: string): ReadonlyArray<string> => [
  `export const ${name} = Schema.String.pipe(Schema.brand(${string(name)}));`,
  typeAlias(name),
];

const enumBlock = (names: Names, definition: EnumDefinition): ReadonlyArray<string> => {
  const name = names.schemas.get(definition.id) ?? definition.name;
  const tail = annotations(name, definition.description);
  return [
    ...(definition.values.length === 0
      ? [`export const ${name} = Schema.Never${tail};`]
      : [
          `export const ${name} = Schema.Union([`,
          ...definition.values.map(
            (value) =>
              `${INDENT}Schema.Literal(${string(value.name)})${value.description === undefined ? "" : `.annotate({ description: ${string(value.description)} })`},`,
          ),
          `])${tail};`,
        ]),
    typeAlias(name),
  ];
};

const entityBlock = (
  names: Names,
  references: ReadonlyArray<Reference>,
  entity: EntityDefinition,
): ReadonlyArray<string> => {
  const name = names.schemas.get(entity.id) ?? entity.name;
  const fields = uniqueFields([
    { name: "id", schema: names.ids.get(entity.id) ?? "Schema.String", comments: [] },
    ...entity.attributes.map((attribute) => attributeField(names, attribute)),
    ...references.filter(({ holderId }) => holderId === entity.id).map(({ field }) => field),
  ]);
  return [
    `export const ${name} = Schema.Struct({`,
    ...fields.map(fieldLine),
    `})${annotations(name, entity.description)};`,
    typeAlias(name),
  ];
};

export const toEffectSchema = (document: DomainModelDocument): string => {
  const names = namesOf(document);
  const references = Array.flatMap(document.associations, (association) =>
    Option.toArray(referenceOf(document, names, association)),
  );
  const blocks: ReadonlyArray<ReadonlyArray<string>> = [
    ['import { Schema } from "effect";'],
    ...(document.entities.length === 0
      ? []
      : [document.entities.flatMap((entity) => idBlock(names.ids.get(entity.id) ?? ""))]),
    ...document.types.map((definition) => enumBlock(names, definition)),
    ...document.entities.map((entity) => entityBlock(names, references, entity)),
  ];
  return pipe(
    blocks,
    Array.map((block) => block.join("\n")),
    Array.join("\n\n"),
  );
};
