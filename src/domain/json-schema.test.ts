import { expect, test } from "vitest";

import { domainModelJsonSchema } from "./json-schema";

// Regenerate with `pnpm schema:generate` after changing schema.ts.
test("the committed JSON Schema matches schema.ts", async () => {
  await expect(domainModelJsonSchema()).toMatchFileSnapshot(
    "../../schema/domain-model.schema.json",
  );
});
