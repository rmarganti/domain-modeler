import { Schema } from "effect";

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;
export const PostId = Schema.String.pipe(Schema.brand("PostId"));
export type PostId = typeof PostId.Type;
export const TagId = Schema.String.pipe(Schema.brand("TagId"));
export type TagId = typeof TagId.Type;

export const Role = Schema.Union([
  Schema.Literal("reader"),
  Schema.Literal("author"),
  Schema.Literal("admin"),
]).annotate({ identifier: "Role" });
export type Role = typeof Role.Type;

export const User = Schema.Struct({
  id: UserId,
  email: Schema.String, // unique
  displayName: Schema.optional(Schema.String),
  role: Role,
}).annotate({ identifier: "User", description: "A registered author or reader." });
export type User = typeof User.Type;

export const Post = Schema.Struct({
  id: PostId,
  title: Schema.String,
  publishedAt: Schema.optional(Schema.DateTimeUtc),
  userId: UserId,
  tagIds: Schema.Array(TagId),
}).annotate({ identifier: "Post" });
export type Post = typeof Post.Type;

export const Tag = Schema.Struct({
  id: TagId,
  label: Schema.String, // unique
}).annotate({ identifier: "Tag" });
export type Tag = typeof Tag.Type;
