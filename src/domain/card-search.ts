import { fuzzyMatch } from "./fuzzy";
import type { DomainModelDocument } from "./schema";

export type SearchCard = Readonly<{ nodeId: string; name: string; kind: "Entity" | "Enum" }>;
export type CardMatch = Readonly<{ card: SearchCard; indices: ReadonlyArray<number> }>;

const alphabetical = (a: SearchCard, b: SearchCard): number =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
  a.name.localeCompare(b.name) ||
  a.kind.localeCompare(b.kind) ||
  a.nodeId.localeCompare(b.nodeId);

/**
 * Fuzzy-match card names. Rank ties, and an empty query, fall back to
 * alphabetical order.
 */
export const matchCards = (cards: ReadonlyArray<SearchCard>, query: string): CardMatch[] =>
  fuzzyMatch([...cards].sort(alphabetical), query, (card) => card.name).map(
    ({ item, indices }) => ({ card: item, indices }),
  );

export const searchCards = (
  document: DomainModelDocument,
  query: string,
  kind?: SearchCard["kind"],
): CardMatch[] =>
  matchCards(
    [
      ...document.entities.map(({ id, name }) => ({ nodeId: id, name, kind: "Entity" as const })),
      ...document.types.map(({ id, name }) => ({ nodeId: id, name, kind: "Enum" as const })),
    ].filter((card) => kind === undefined || card.kind === kind),
    query,
  );
