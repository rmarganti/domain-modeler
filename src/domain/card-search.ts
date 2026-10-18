import type { DomainModelDocument } from "./schema";

export type SearchCard = Readonly<{ nodeId: string; name: string; kind: "Entity" | "Enum" }>;
export type CardMatch = Readonly<{ card: SearchCard; indices: ReadonlyArray<number> }>;

const alphabetical = (a: SearchCard, b: SearchCard): number =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
  a.name.localeCompare(b.name) ||
  a.kind.localeCompare(b.kind) ||
  a.nodeId.localeCompare(b.nodeId);

const isBoundary = (name: string, index: number): boolean => {
  const current = name[index] ?? "";
  const previous = name[index - 1] ?? "";
  const next = name[index + 1] ?? "";
  return (
    index === 0 ||
    /[^\p{L}\p{N}]/u.test(previous) ||
    (/\p{Lu}/u.test(current) && (/\p{Ll}|\p{N}/u.test(previous) || /\p{Ll}/u.test(next)))
  );
};

const subsequence = (name: string, query: string): number[] => {
  const indices: number[] = [];
  const folded = name.toLowerCase();
  let from = 0;
  for (const character of query) {
    const index = folded.indexOf(character, from);
    if (index === -1) {
      return [];
    }
    indices.push(index);
    from = index + character.length;
  }
  return indices;
};

/**
 * Each contiguous run must start at a word/hump boundary. Keep one path per
 * ending position so an early match cannot hide a better boundary alignment.
 */
const boundarySubsequence = (name: string, query: string): number[] => {
  const folded = name.toLowerCase();
  let paths: number[][] = [[]];
  for (const character of query) {
    const next: number[][] = [];
    for (
      let index = folded.indexOf(character);
      index !== -1;
      index = folded.indexOf(character, index + 1)
    ) {
      const previous = paths.find((path) => {
        const last = path.at(-1) ?? -1;
        return last < index && (isBoundary(name, index) || (path.length > 0 && last === index - 1));
      });
      if (previous !== undefined) {
        next.push([...previous, index]);
      }
    }
    paths = next;
  }
  return paths[0] ?? [];
};

/**
 * Rank case-insensitive subsequences, retaining the matched character positions
 * for display. Boundary matches prefer word starts, camel humps and acronyms.
 */
export const matchCards = (cards: ReadonlyArray<SearchCard>, query: string): CardMatch[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...cards].sort(alphabetical).map((card) => ({ card, indices: [] }));
  }
  return cards
    .flatMap((card) => {
      const indices = subsequence(card.name, needle);
      if (indices.length === 0) {
        return [];
      }
      const name = card.name.toLowerCase();
      const boundaries = boundarySubsequence(card.name, needle);
      const rank =
        name === needle ? 0 : name.startsWith(needle) ? 1 : boundaries.length > 0 ? 2 : 3;
      return [{ card, indices: rank === 2 ? boundaries : indices, rank }];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || a.card.name.length - b.card.name.length || alphabetical(a.card, b.card),
    )
    .map(({ card, indices }) => ({ card, indices }));
};

export const searchCards = (document: DomainModelDocument, query: string): CardMatch[] =>
  matchCards(
    [
      ...document.entities.map(({ id, name }) => ({ nodeId: id, name, kind: "Entity" as const })),
      ...document.types.map(({ id, name }) => ({ nodeId: id, name, kind: "Enum" as const })),
    ],
    query,
  );
