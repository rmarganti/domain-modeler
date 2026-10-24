import { Schema } from "effect";
import { expect, test } from "vitest";

import example from "../../examples/domain-modeler.json";
import { diagnose } from "./diagnostics";
import { DomainModelDocumentJsonString } from "./schema";

// The format changes in place with no migrations, so a schema change must
// keep the published example loading cleanly.
test("the example model decodes with no diagnostics", () => {
  const document = Schema.decodeUnknownSync(DomainModelDocumentJsonString)(JSON.stringify(example));

  expect(diagnose(document)).toEqual([]);
});
