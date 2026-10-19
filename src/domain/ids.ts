import { Array, Schema } from "effect";

import type { DomainModelDocument } from "./schema";

// IDS
// IDs are random and opaque, so one is never reused and never collides with
// one an outside tool mints. Update stays pure: the randomness comes from a
// seeded xoshiro128** generator whose state lives in the Model, and minting
// an ID returns the advanced state.

export const ID_LENGTH = 10;

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Four uint32 words of xoshiro128** state. Never all zero. */
export const IdState = Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number]);
export type IdState = typeof IdState.Type;

/** A generator state from any four words, such as `crypto.getRandomValues`
 *  output. All zeros would only ever produce zeros, so it becomes a fixed
 *  nonzero state. */
export const seed = (words: ArrayLike<number>): IdState => {
  const state: IdState = [words[0]! >>> 0, words[1]! >>> 0, words[2]! >>> 0, words[3]! >>> 0];
  return Array.every(state, (word) => word === 0) ? [1, 0, 0, 0] : state;
};

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

const step = ([s0, s1, s2, s3]: IdState): readonly [number, IdState] => {
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = s1 << 9;
  const n2 = s2 ^ s0;
  const n3 = s3 ^ s1;
  const n1 = s1 ^ n2;
  const n0 = s0 ^ n3;
  return [result, [n0 >>> 0, n1 >>> 0, (n2 ^ t) >>> 0, rotl(n3, 11) >>> 0]];
};

// The largest multiple of the alphabet size that fits in a uint32. Draws at
// or above it are rejected so every character is equally likely.
const UNBIASED_LIMIT = Math.floor(2 ** 32 / ALPHABET.length) * ALPHABET.length;

const randomCharacter = (state: IdState): readonly [string, IdState] => {
  let [draw, next] = step(state);
  while (draw >= UNBIASED_LIMIT) {
    [draw, next] = step(next);
  }
  return [ALPHABET[draw % ALPHABET.length]!, next];
};

const randomId = (state: IdState): readonly [string, IdState] => {
  let id = "";
  let next = state;
  for (let i = 0; i < ID_LENGTH; i++) {
    const [character, after] = randomCharacter(next);
    id += character;
    next = after;
  }
  return [id, next];
};

/** Every ID in the document, of any kind. */
export const documentIds = (document: DomainModelDocument): ReadonlySet<string> =>
  new Set([
    ...Array.map(document.entities, (entity) => entity.id),
    ...Array.flatMap(document.entities, (entity) =>
      Array.map(entity.attributes, (attribute) => attribute.id),
    ),
    ...Array.map(document.types, (definition) => definition.id),
    ...Array.flatMap(document.types, (definition) =>
      Array.map(definition.values, (value) => value.id),
    ),
    ...Array.map(document.associations, (association) => association.id),
  ]);

/** A new ID unused anywhere in the document, plus the state to mint the next
 *  one from. A taken ID is skipped, so uniqueness never rests on odds.
 *  `reserved` holds IDs minted for the same edit but not yet in the document. */
export const nextId = (
  state: IdState,
  document: DomainModelDocument,
  reserved: ReadonlyArray<string> = [],
): { readonly id: string; readonly state: IdState } => {
  const taken = documentIds(document);
  let [id, next] = randomId(state);
  while (taken.has(id) || reserved.includes(id)) {
    [id, next] = randomId(next);
  }
  return { id, state: next };
};
