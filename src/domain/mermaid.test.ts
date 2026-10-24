import { describe, expect, test } from "vitest";

import * as Doc from "./document";
import { toMermaid } from "./mermaid";
import type {
  AssociationDefinition,
  AttributeDefinition,
  DomainModelDocument,
  EntityDefinition,
  EnumDefinition,
} from "./schema";

const model = (
  parts: Partial<Pick<DomainModelDocument, "entities" | "types" | "associations">>,
): DomainModelDocument => ({ ...Doc.emptyDocument("Blog"), ...parts });

const entity = (
  name: string,
  attributes: ReadonlyArray<AttributeDefinition> = [],
): EntityDefinition => ({ id: name.toLowerCase(), name, attributes });

const attribute = (
  name: string,
  overrides: Partial<AttributeDefinition> = {},
): AttributeDefinition => ({ ...Doc.newAttribute(name, name), ...overrides });

const lines = (...rows: ReadonlyArray<string>): string => rows.join("\n");

describe("toMermaid", () => {
  test("an empty model is a bare diagram", () => {
    expect(toMermaid(Doc.emptyDocument("Blog"))).toBe("erDiagram");
  });

  test("an entity lists its attributes with their types", () => {
    const document = model({
      entities: [entity("Post", [attribute("title"), attribute("views", { type: "Integer" })])],
    });
    expect(toMermaid(document)).toBe(
      lines("erDiagram", "    Post {", "        String title", "        Integer views", "    }"),
    );
  });

  test("an entity without attributes is just its name", () => {
    expect(toMermaid(model({ entities: [entity("Tag")] }))).toBe(lines("erDiagram", "    Tag"));
  });

  test("a list attribute's type gets brackets", () => {
    const document = model({
      entities: [entity("Post", [attribute("tags", { multiplicity: { min: 1, max: "many" } })])],
    });
    expect(toMermaid(document)).toContain("        String[] tags\n");
  });

  test("a unique attribute is marked as a key", () => {
    const document = model({ entities: [entity("User", [attribute("email", { unique: true })])] });
    expect(toMermaid(document)).toContain("        String email UK\n");
  });

  test("an optional attribute says so in its comment", () => {
    const document = model({
      entities: [
        entity("User", [
          attribute("nickname", { multiplicity: { min: 0, max: "one" } }),
          attribute("handle", { multiplicity: { min: 0, max: "one" }, unique: true }),
        ]),
      ],
    });
    expect(toMermaid(document)).toContain(
      lines('        String nickname "optional"', '        String handle UK "optional"'),
    );
  });

  test("characters Mermaid can't read in attribute names and types become underscores", () => {
    const document = model({
      entities: [entity("User", [attribute("first name", { type: { typeId: "kind" } })])],
      types: [{ id: "kind", kind: "Enum", name: "User Kind", values: [] }],
    });
    expect(toMermaid(document)).toContain("        User_Kind first_name\n");
  });

  describe("enum attributes", () => {
    const postStatus: EnumDefinition = {
      id: "status",
      kind: "Enum",
      name: "PostStatus",
      values: [
        { id: "v1", name: "Draft" },
        { id: "v2", name: "Published" },
        { id: "v3", name: "Archived" },
      ],
    };

    test("are typed by the enum and list its values in the comment", () => {
      const document = model({
        entities: [entity("Post", [attribute("status", { type: { typeId: "status" } })])],
        types: [postStatus],
      });
      expect(toMermaid(document)).toContain(
        '        PostStatus status "Draft | Published | Archived"\n',
      );
    });

    test("put the optional marker before the values", () => {
      const document = model({
        entities: [
          entity("Post", [
            attribute("status", {
              type: { typeId: "status" },
              multiplicity: { min: 0, max: "one" },
            }),
          ]),
        ],
        types: [postStatus],
      });
      expect(toMermaid(document)).toContain(
        '        PostStatus status "optional · Draft | Published | Archived"\n',
      );
    });

    test("of an enum with no values have no comment", () => {
      const document = model({
        entities: [entity("Post", [attribute("status", { type: { typeId: "status" } })])],
        types: [{ ...postStatus, values: [] }],
      });
      expect(toMermaid(document)).toContain("        PostStatus status\n");
    });
  });

  describe("associations", () => {
    const end = (
      entityId: string,
      min: 0 | 1,
      max: "one" | "many",
    ): AssociationDefinition["ends"][0] => ({ entityId, multiplicity: { min, max } });

    const entities = [entity("User"), entity("Post"), entity("Category")];

    test("put each end's multiplicity beside its own entity", () => {
      const document = model({
        entities,
        associations: [
          { id: "a1", name: "writes", ends: [end("user", 1, "one"), end("post", 0, "many")] },
          { id: "a2", name: "files", ends: [end("post", 0, "one"), end("category", 1, "many")] },
          { id: "a3", name: "pins", ends: [end("category", 0, "many"), end("post", 1, "one")] },
          { id: "a4", name: "drafts", ends: [end("post", 1, "many"), end("user", 0, "one")] },
        ],
      });
      expect(toMermaid(document)).toBe(
        lines(
          "erDiagram",
          "    User",
          "    Post",
          "    Category",
          '    User ||--o{ Post : "writes"',
          '    Post |o--|{ Category : "files"',
          '    Category }o--|| Post : "pins"',
          '    Post }|--o| User : "drafts"',
        ),
      );
    });

    test("an unnamed association gets an empty label", () => {
      const document = model({
        entities,
        associations: [{ id: "a1", ends: [end("user", 1, "one"), end("post", 0, "many")] }],
      });
      expect(toMermaid(document)).toContain('    User ||--o{ Post : ""');
    });

    test("an entity can relate to itself", () => {
      const document = model({
        entities,
        associations: [
          { id: "a1", name: "follows", ends: [end("user", 0, "many"), end("user", 0, "many")] },
        ],
      });
      expect(toMermaid(document)).toContain('    User }o--o{ User : "follows"');
    });

    test("an entity name with spaces is quoted everywhere it appears", () => {
      const document = model({
        entities: [entity("Order Line", [attribute("quantity", { type: "Integer" })]), ...entities],
        associations: [{ id: "a1", ends: [end("order line", 0, "many"), end("post", 1, "one")] }],
      });
      const mermaid = toMermaid(document);
      expect(mermaid).toContain('    "Order Line" {\n');
      expect(mermaid).toContain('    "Order Line" }o--|| Post : ""');
    });

    test("double quotes in names and values become single quotes", () => {
      const document = model({
        entities: [
          entity('The "Best" Post', [attribute("status", { type: { typeId: "status" } })]),
          ...entities,
        ],
        types: [
          { id: "status", kind: "Enum", name: "Status", values: [{ id: "v1", name: 'Say "hi"' }] },
        ],
        associations: [
          {
            id: "a1",
            name: 'is "about"',
            ends: [end('the "best" post', 1, "one"), end("user", 1, "one")],
          },
        ],
      });
      const mermaid = toMermaid(document);
      expect(mermaid).toContain(`    "The 'Best' Post" {\n`);
      expect(mermaid).toContain(`        Status status "Say 'hi'"\n`);
      expect(mermaid).toContain(`    "The 'Best' Post" ||--|| User : "is 'about'"`);
    });

    test("an association to a missing entity is left out", () => {
      const document = model({
        entities,
        associations: [{ id: "a1", ends: [end("user", 1, "one"), end("gone", 0, "many")] }],
      });
      expect(toMermaid(document)).not.toContain("--");
    });
  });
});
