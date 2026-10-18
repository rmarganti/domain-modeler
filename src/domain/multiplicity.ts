import type { Multiplicity } from "./schema";

// Association ends and attributes share one multiplicity shape and one
// ordered list of labels.

export const MULTIPLICITIES: ReadonlyArray<
  Readonly<{ multiplicity: Multiplicity; label: string }>
> = [
  { multiplicity: { min: 1, max: "one" }, label: "1" },
  { multiplicity: { min: 0, max: "one" }, label: "0..1" },
  { multiplicity: { min: 0, max: "many" }, label: "0..*" },
  { multiplicity: { min: 1, max: "many" }, label: "1..*" },
];

export const multiplicityEquals = (a: Multiplicity, b: Multiplicity): boolean =>
  a.min === b.min && a.max === b.max;

/** UML notation: `1` for exactly one, otherwise `min..max` with `*` for many. */
export const multiplicityLabel = ({ min, max }: Multiplicity): string =>
  min === 1 && max === "one" ? "1" : `${min}..${max === "many" ? "*" : "1"}`;
