import { Array, Option, pipe } from "effect";
import pluralize from "pluralize";

import { findEntity } from "./document";
import type { AssociationDefinition, DomainModelDocument, EndIndex, Multiplicity } from "./schema";

// Role names are derived, never stored, unless the user overrides them. This
// is the only module that knows about English plurals.

/** `"Line Item"` → `lineItem`. Splits on anything that isn't a letter or
 *  digit and keeps each word's casing apart from its first letter. */
export const toCamelCase = (name: string): string =>
  pipe(
    name.split(/[^\p{L}\p{N}]+/u),
    Array.filter((word) => word !== ""),
    Array.map(
      (word, index) =>
        (index === 0 ? word.charAt(0).toLowerCase() : word.charAt(0).toUpperCase()) + word.slice(1),
    ),
    Array.join(""),
  );

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
