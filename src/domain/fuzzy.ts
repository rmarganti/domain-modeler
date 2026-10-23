// Fuzzy matching shared by every picker: cards by name, commands by label
// and aliases.

export type FuzzyMatch<Item> = Readonly<{
  item: Item;
  /** Matched positions in the item's name. Empty when an alias matched. */
  indices: ReadonlyArray<number>;
  /** The alias that matched, when the name itself didn't. */
  maybeAlias?: string;
}>;

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

type Scored = Readonly<{ rank: number; indices: number[] }>;

/** Exact > prefix > word/camel starts > other subsequence; undefined if no match. */
const score = (name: string, needle: string): Scored | undefined => {
  const indices = subsequence(name, needle);
  if (indices.length === 0) {
    return undefined;
  }
  const folded = name.toLowerCase();
  const boundaries = boundarySubsequence(name, needle);
  const rank =
    folded === needle ? 0 : folded.startsWith(needle) ? 1 : boundaries.length > 0 ? 2 : 3;
  return { rank, indices: rank === 2 ? boundaries : indices };
};

/** Alias matches rank below every name match. */
const ALIAS_RANK_OFFSET = 4;

/**
 * Rank case-insensitive subsequences, retaining the matched character positions
 * for display. Boundary matches prefer word starts, camel humps and acronyms.
 * Ties go to the shorter matched text, then to input order, so callers sort
 * their items first. An empty query keeps every item in input order.
 */
export const fuzzyMatch = <Item>(
  items: ReadonlyArray<Item>,
  query: string,
  nameOf: (item: Item) => string,
  aliasesOf: (item: Item) => ReadonlyArray<string> = () => [],
): FuzzyMatch<Item>[] => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return items.map((item) => ({ item, indices: [] }));
  }
  return items
    .flatMap((item, order) => {
      const name = nameOf(item);
      const byName = score(name, needle);
      if (byName !== undefined) {
        return [
          {
            match: { item, indices: byName.indices },
            rank: byName.rank,
            length: name.length,
            order,
          },
        ];
      }
      const byAlias = aliasesOf(item)
        .flatMap((alias) => {
          const scored = score(alias, needle);
          return scored === undefined ? [] : [{ alias, rank: scored.rank }];
        })
        .sort((a, b) => a.rank - b.rank || a.alias.length - b.alias.length)[0];
      return byAlias === undefined
        ? []
        : [
            {
              match: { item, indices: [], maybeAlias: byAlias.alias },
              rank: byAlias.rank + ALIAS_RANK_OFFSET,
              length: byAlias.alias.length,
              order,
            },
          ];
    })
    .sort((a, b) => a.rank - b.rank || a.length - b.length || a.order - b.order)
    .map(({ match }) => match);
};
