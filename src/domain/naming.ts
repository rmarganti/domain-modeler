import { Array, Option, pipe } from "effect";
import pluralize from "pluralize";

import { findEntity } from "./document";
import type { AssociationDefinition, DomainModelDocument, EndIndex, Multiplicity } from "./schema";

// Role names are derived, never stored, unless the user overrides them. This
// is the only module that knows about English plurals.

const words = (name: string): ReadonlyArray<string> =>
  Array.filter(name.split(/[^\p{L}\p{N}]+/u), (word) => word !== "");

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** `"Line Item"` → `lineItem`. Splits on anything that isn't a letter or
 *  digit and keeps each word's casing apart from its first letter. */
export const toCamelCase = (name: string): string =>
  pipe(
    words(name),
    Array.map((word, index) =>
      index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : capitalize(word),
    ),
    Array.join(""),
  );

/** `"order status"` → `OrderStatus`, splitting words like {@link toCamelCase}. */
export const toPascalCase = (name: string): string =>
  pipe(words(name), Array.map(capitalize), Array.join(""));

/** The name of an enum created from a field: the field name in PascalCase,
 *  or `NewEnum` when that is blank. */
export const enumNameForAttribute = (attributeName: string): string => {
  const name = toPascalCase(attributeName);
  return name === "" ? "NewEnum" : name;
};

/** `"My Blog!"` → `my-blog`, the start of a file name suggested for a model. */
export const fileStem = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug === "" ? "untitled" : slug;
};

export const defaultRole = (entityName: string, multiplicity: Multiplicity): string => {
  const role = toCamelCase(entityName);
  return multiplicity.max === "many" ? pluralize(role) : role;
};

/** The name the other end uses to reach `ends[endIndex]`: the explicit role
 *  unless it is blank, else one derived from the entity name, which is none
 *  when the end's entity does not exist. */
export const effectiveRole = (
  document: DomainModelDocument,
  association: AssociationDefinition,
  endIndex: EndIndex,
): Option.Option<string> => {
  const end = association.ends[endIndex];
  const role = end.role?.trim() ?? "";
  return role !== ""
    ? Option.some(role)
    : Option.map(findEntity(document, end.entityId), (entity) =>
        defaultRole(entity.name, end.multiplicity),
      );
};
