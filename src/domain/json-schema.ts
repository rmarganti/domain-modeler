import { Schema } from "effect";

import { DomainModelDocument } from "./schema";

/** The file format as a JSON Schema (draft 2020-12), serialized the way it's
 *  committed at schema/domain-model.schema.json. It checks shape only: rules
 *  that span the document, such as references resolving, are diagnostics. */
export const domainModelJsonSchema = (): string => {
  const { schema, definitions } = Schema.toJsonSchemaDocument(DomainModelDocument);
  const document = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...schema,
    $defs: definitions,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
};
