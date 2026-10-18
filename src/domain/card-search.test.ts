import { describe, expect, test } from "vitest";

import { matchCards, searchCards, type SearchCard } from "./card-search";
import { sampleDocument } from "./document";

const cards = (...names: string[]): SearchCard[] =>
  names.map((name, index) => ({ name, nodeId: `e${index}`, kind: "Entity" }));
const names = (query: string, ...candidates: string[]): string[] =>
  matchCards(cards(...candidates), query).map(({ card }) => card.name);

describe("card matching", () => {
  test("ranks exact, prefix, word/camel starts, then other subsequences", () => {
    expect(names("up", "Setup", "User Profile", "Uppercase", "Up", "UserProfile")).toEqual([
      "Up",
      "Uppercase",
      "UserProfile",
      "User Profile",
      "Setup",
    ]);
  });

  test("breaks rank ties by length and then alphabetically", () => {
    expect(names("at", "Amulet", "About", "Arbitrate", "Agent")).toEqual([
      "About",
      "Agent",
      "Amulet",
      "Arbitrate",
    ]);
  });

  test("case-insensitive queries return the original card and matched positions", () => {
    const card = cards("UserProfile")[0]!;
    expect(matchCards([card], "uP")).toEqual([{ card, indices: [0, 4] }]);
    expect(names("TAG", "Tag", "Tagging", "target")).toEqual(["Tag", "Tagging", "target"]);
    expect(names(" tag ", "Tag")).toEqual(["Tag"]);
  });

  test("empty and whitespace queries list every card alphabetically, without highlights", () => {
    const candidates = cards("User", "tag", "Post");
    expect(matchCards(candidates, "").map(({ card }) => card.name)).toEqual([
      "Post",
      "tag",
      "User",
    ]);
    expect(matchCards(candidates, " ")).toEqual(matchCards(candidates, ""));
    expect(matchCards(candidates, "").every(({ indices }) => indices.length === 0)).toBe(true);
    expect(candidates.map(({ name }) => name)).toEqual(["User", "tag", "Post"]);
  });

  test("rejects missing, reversed and repeated letters with no complete subsequence", () => {
    expect(names("zzz", "User", "Tag")).toEqual([]);
    expect(names("gat", "Tag")).toEqual([]);
    expect(names("tt", "Tag")).toEqual([]);
    expect(matchCards([], "a")).toEqual([]);
    expect(matchCards(cards(""), "a")).toEqual([]);
  });

  test("prefers boundary alignment even when an earlier non-boundary letter matches", () => {
    expect(matchCards(cards("SuperUserProfile"), "up")[0]?.indices).toEqual([5, 9]);
    expect(names("hr", "XHR", "HTTPResponse", "Hero")).toEqual(["HTTPResponse", "XHR", "Hero"]);
    expect(matchCards(cards("user_profile"), "up")[0]?.indices).toEqual([0, 5]);
  });

  test("word-start ranking includes contiguous runs and runs across camel humps", () => {
    expect(names("pro", "Approve", "UserProfile", "Profile")).toEqual([
      "Profile",
      "UserProfile",
      "Approve",
    ]);
    expect(matchCards(cards("UserProfile"), "upr")[0]?.indices).toEqual([0, 4, 5]);
    expect(matchCards(cards("FooBarBaz"), "fbarba")[0]?.indices).toEqual([0, 3, 4, 5, 6, 7]);
  });

  test("duplicate names are deterministic and retain entity/enum identity", () => {
    const candidates: SearchCard[] = [
      { name: "Role", nodeId: "t1", kind: "Enum" },
      { name: "Role", nodeId: "e2", kind: "Entity" },
      { name: "Role", nodeId: "e1", kind: "Entity" },
    ];
    expect(matchCards(candidates, "role").map(({ card }) => card.nodeId)).toEqual([
      "e1",
      "e2",
      "t1",
    ]);
  });

  test("searches both document card kinds but not fields or relationship names", () => {
    expect(searchCards(sampleDocument, "").map(({ card }) => [card.name, card.kind])).toEqual([
      ["Post", "Entity"],
      ["Role", "Enum"],
      ["Tag", "Entity"],
      ["User", "Entity"],
    ]);
    expect(searchCards(sampleDocument, "email")).toEqual([]);
    expect(searchCards(sampleDocument, "writes")).toEqual([]);
  });
});
