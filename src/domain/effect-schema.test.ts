import { DateTime, Schema } from "effect";
import { describe, expect, test } from "vitest";

import example from "../../examples/domain-modeler.json";
import * as Doc from "./document";
import { toEffectSchema } from "./effect-schema";
import * as Blog from "./effect-schema.fixture";
import {
  DomainModelDocumentJsonString,
  type AssociationDefinition,
  type AttributeDefinition,
  type DomainModelDocument,
  type EntityDefinition,
  type EnumDefinition,
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

const end = (
  entityId: string,
  min: 0 | 1,
  max: "one" | "many",
  role?: string,
): AssociationDefinition["ends"][0] => ({
  entityId,
  multiplicity: { min, max },
  ...(role === undefined ? {} : { role }),
});

const lines = (...rows: ReadonlyArray<string>): string => rows.join("\n");

describe("toEffectSchema", () => {
  // Regenerate both with `pnpm vitest run --update src/domain/effect-schema.test.ts`.
  // They are type-checked with the rest of src, so they prove the output compiles.
  test("the committed fixture matches the sample document", async () => {
    await expect(`${toEffectSchema(Doc.sampleDocument)}\n`).toMatchFileSnapshot(
      "./effect-schema.fixture.ts",
    );
  });

  test("the committed example matches its model", async () => {
    const document = Schema.decodeUnknownSync(DomainModelDocumentJsonString)(
      JSON.stringify(example),
    );
    await expect(`${toEffectSchema(document)}\n`).toMatchFileSnapshot(
      "../../examples/domain-modeler.schema.ts",
    );
  });

  test("the generated schemas decode in-memory values", () => {
    const post = Schema.decodeUnknownSync(Blog.Post)({
      id: "p1",
      title: "Hello",
      publishedAt: DateTime.makeUnsafe("2026-10-24T12:00:00Z"),
      userId: "u1",
      tagIds: ["t1", "t2"],
    });
    expect(post.tagIds).toEqual(["t1", "t2"]);
    expect(() =>
      Schema.decodeUnknownSync(Blog.User)({ id: "u1", email: "a@b.c", role: "owner" }),
    ).toThrow();
  });

  test("an empty model is just the import", () => {
    expect(toEffectSchema(Doc.emptyDocument("Blog"))).toBe('import { Schema } from "effect";');
  });

  test("an entity gets a branded ID, a struct, and a type", () => {
    const document = model({
      entities: [{ ...entity("Post", [attribute("title")]), description: 'A "post".' }],
    });
    expect(toEffectSchema(document)).toBe(
      lines(
        'import { Schema } from "effect";',
        "",
        'export const PostId = Schema.String.pipe(Schema.brand("PostId"));',
        "export type PostId = typeof PostId.Type;",
        "",
        "export const Post = Schema.Struct({",
        "  id: PostId,",
        "  title: Schema.String,",
        '}).annotate({ identifier: "Post", description: "A \\"post\\"." });',
        "export type Post = typeof Post.Type;",
      ),
    );
  });

  test("primitives map to in-memory schemas", () => {
    const types = ["String", "Integer", "Decimal", "Boolean", "Date", "DateTime", "Json"] as const;
    const document = model({
      entities: [
        entity(
          "Thing",
          types.map((type) => attribute(type.toLowerCase(), { type })),
        ),
      ],
    });
    expect(toEffectSchema(document)).toContain(
      lines(
        "  string: Schema.String,",
        "  integer: Schema.Int,",
        "  decimal: Schema.Finite,",
        "  boolean: Schema.Boolean,",
        "  date: Schema.Date, // date only",
        "  datetime: Schema.DateTimeUtc,",
        "  json: Schema.Json,",
      ),
    );
  });

  test("multiplicity makes a field optional or a list", () => {
    const document = model({
      entities: [
        entity("Post", [
          attribute("subtitle", { multiplicity: { min: 0, max: "one" } }),
          attribute("tags", { multiplicity: { min: 0, max: "many" } }),
          attribute("authors", { multiplicity: { min: 1, max: "many" } }),
        ]),
      ],
    });
    expect(toEffectSchema(document)).toContain(
      lines(
        "  subtitle: Schema.optional(Schema.String),",
        "  tags: Schema.Array(Schema.String),",
        "  authors: Schema.NonEmptyArray(Schema.String),",
      ),
    );
  });

  test("a description annotates the value, inside optional", () => {
    const document = model({
      entities: [
        entity("User", [
          attribute("bio", { multiplicity: { min: 0, max: "one" }, description: "About them" }),
        ]),
      ],
    });
    expect(toEffectSchema(document)).toContain(
      '  bio: Schema.optional(Schema.String.annotate({ description: "About them" })),',
    );
  });

  test("a unique attribute says so in a comment", () => {
    const document = model({ entities: [entity("User", [attribute("email", { unique: true })])] });
    expect(toEffectSchema(document)).toContain("  email: Schema.String, // unique\n");
  });

  describe("enums", () => {
    const status: EnumDefinition = {
      id: "status",
      kind: "Enum",
      name: "PostStatus",
      description: "Where a post is.",
      values: [
        { id: "v1", name: "Draft", description: "Not visible yet" },
        { id: "v2", name: "Published" },
      ],
    };

    test("are a union of literals, each with its description", () => {
      expect(toEffectSchema(model({ types: [status] }))).toBe(
        lines(
          'import { Schema } from "effect";',
          "",
          "export const PostStatus = Schema.Union([",
          '  Schema.Literal("Draft").annotate({ description: "Not visible yet" }),',
          '  Schema.Literal("Published"),',
          ']).annotate({ identifier: "PostStatus", description: "Where a post is." });',
          "export type PostStatus = typeof PostStatus.Type;",
        ),
      );
    });

    test("without values accept nothing", () => {
      expect(toEffectSchema(model({ types: [{ ...status, values: [] }] }))).toContain(
        'export const PostStatus = Schema.Never.annotate({ identifier: "PostStatus", description: "Where a post is." });',
      );
    });

    test("type the attributes that use them, before the entities", () => {
      const document = model({
        entities: [entity("Post", [attribute("status", { type: { typeId: "status" } })])],
        types: [status],
      });
      const output = toEffectSchema(document);
      expect(output).toContain("  status: PostStatus,\n");
      expect(output.indexOf("const PostStatus")).toBeLessThan(output.indexOf("const Post ="));
    });

    test("a missing enum types the attribute as unknown", () => {
      const document = model({
        entities: [entity("Post", [attribute("status", { type: { typeId: "gone" } })])],
      });
      expect(toEffectSchema(document)).toContain("  status: Schema.Unknown,\n");
    });
  });

  describe("names", () => {
    test("that aren't identifiers are rewritten, others are kept", () => {
      const document = model({
        entities: [
          entity("Order Line", [attribute("unit price"), attribute("my_field"), attribute("2fa")]),
        ],
        types: [{ id: "kind", kind: "Enum", name: "order kind", values: [] }],
      });
      const output = toEffectSchema(document);
      expect(output).toContain("export const OrderLine = Schema.Struct({");
      expect(output).toContain(
        'export const OrderLineId = Schema.String.pipe(Schema.brand("OrderLineId"));',
      );
      expect(output).toContain("export const OrderKind = ");
      expect(output).toContain(
        lines(
          "  unitPrice: Schema.String,",
          "  my_field: Schema.String,",
          "  _2fa: Schema.String,",
        ),
      );
    });

    test("that clash get a number", () => {
      const document = model({
        entities: [
          { ...entity("User", [attribute("id"), attribute("name"), attribute("Name")]), id: "u1" },
          { ...entity("user"), id: "u2" },
          { ...entity("UserId"), id: "u3" },
          { ...entity("Schema"), id: "u4" },
        ],
      });
      const output = toEffectSchema(document);
      expect(output).toContain(
        lines(
          "  id: UserId2,",
          "  id2: Schema.String,",
          "  name: Schema.String,",
          "  Name: Schema.String,",
        ),
      );
      expect(output).toContain("export const user = Schema.Struct({");
      expect(output).toContain("export const UserId = Schema.Struct({");
      expect(output).toContain("export const Schema2 = Schema.Struct({");
      expect(output).toContain('export const userId = Schema.String.pipe(Schema.brand("userId"));');
    });
  });

  describe("associations", () => {
    const entities = [entity("User"), entity("Post"), entity("Tag")];
    const fieldsOf = (output: string, name: string): string =>
      output.slice(output.indexOf(`export const ${name} = Schema.Struct`));

    test("one-to-many puts the reference on the many side", () => {
      const output = toEffectSchema(
        model({
          entities,
          associations: [
            { id: "a1", ends: [end("user", 1, "one", "author"), end("post", 0, "many")] },
            { id: "a2", ends: [end("post", 0, "many"), end("user", 0, "one", "editor")] },
          ],
        }),
      );
      expect(fieldsOf(output, "Post")).toContain(
        lines("  id: PostId,", "  authorId: UserId,", "  editorId: Schema.optional(UserId),"),
      );
      expect(fieldsOf(output, "User")).not.toContain("Ids");
    });

    test("one-to-one and many-to-many put it on the end drawn from", () => {
      const output = toEffectSchema(
        model({
          entities,
          associations: [
            { id: "a1", ends: [end("post", 0, "many"), end("tag", 1, "many")] },
            { id: "a2", ends: [end("user", 1, "one"), end("post", 0, "one", "pinnedPost")] },
          ],
        }),
      );
      expect(fieldsOf(output, "Post")).toContain("  tagIds: Schema.NonEmptyArray(TagId),\n");
      expect(fieldsOf(output, "User")).toContain("  pinnedPostId: Schema.optional(PostId),\n");
    });

    test("a self-association references the same entity", () => {
      const output = toEffectSchema(
        model({
          entities,
          associations: [
            { id: "a1", ends: [end("user", 0, "many"), end("user", 0, "many", "followers")] },
          ],
        }),
      );
      expect(fieldsOf(output, "User")).toContain("  followerIds: Schema.Array(UserId),\n");
    });

    test("a role that clashes with an attribute gets a number", () => {
      const output = toEffectSchema(
        model({
          entities: [entity("User"), entity("Post", [attribute("userId")])],
          associations: [{ id: "a1", ends: [end("user", 1, "one"), end("post", 0, "many")] }],
        }),
      );
      expect(output).toContain(lines("  userId: Schema.String,", "  userId2: UserId,"));
    });

    test("an association's description annotates its reference", () => {
      const output = toEffectSchema(
        model({
          entities,
          associations: [
            {
              id: "a1",
              description: "Who wrote it",
              ends: [end("user", 1, "one"), end("post", 0, "many")],
            },
          ],
        }),
      );
      expect(output).toContain('  userId: UserId.annotate({ description: "Who wrote it" }),\n');
    });

    test("an association to a missing entity is left out", () => {
      const output = toEffectSchema(
        model({
          entities,
          associations: [{ id: "a1", ends: [end("user", 1, "one"), end("gone", 0, "many")] }],
        }),
      );
      expect(output).not.toMatch(/^ {2}\w+Ids?: /m);
    });
  });
});
