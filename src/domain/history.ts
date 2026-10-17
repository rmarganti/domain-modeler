import { Array, Option, Schema } from "effect";

import { preservePresentation } from "./document";
import { DomainModelDocument } from "./schema";

/** State snapshot zipper: `past` is ordered oldest first, `future` is ordered
 *  nearest first. */
export const History = Schema.Struct({
  past: Schema.Array(DomainModelDocument),
  present: DomainModelDocument,
  future: Schema.Array(DomainModelDocument),
});
export type History = typeof History.Type;

export const MAX_SNAPSHOTS = 50;

const isSameDocument = Schema.toEquivalence(DomainModelDocument);

export const init = (present: DomainModelDocument): History => ({
  past: [],
  present,
  future: [],
});

/** Records a discrete mutation: the current present becomes the newest past
 *  snapshot (capped at {@link MAX_SNAPSHOTS}) and the redo branch is dropped.
 *  A mutation that changes nothing records nothing. */
export const commit = (
  history: History,
  f: (present: DomainModelDocument) => DomainModelDocument,
): History => {
  const next = f(history.present);
  if (next === history.present || isSameDocument(next, history.present)) {
    return history;
  }
  return {
    past: Array.takeRight([...history.past, history.present], MAX_SNAPSHOTS),
    present: next,
    future: [],
  };
};

/** Applies a transient change (pan, zoom, expansion) without a snapshot. */
export const amend = (
  history: History,
  f: (present: DomainModelDocument) => DomainModelDocument,
): History => ({ ...history, present: f(history.present) });

export const canUndo = (history: History): boolean => Array.isReadonlyArrayNonEmpty(history.past);

export const canRedo = (history: History): boolean => Array.isReadonlyArrayNonEmpty(history.future);

export const undo = (history: History): Option.Option<History> =>
  Option.map(Array.last(history.past), (previous) => ({
    past: Array.dropRight(history.past, 1),
    present: preservePresentation(previous, history.present),
    future: [history.present, ...history.future],
  }));

export const redo = (history: History): Option.Option<History> =>
  Option.map(Array.head(history.future), (next) => ({
    past: Array.takeRight([...history.past, history.present], MAX_SNAPSHOTS),
    present: preservePresentation(next, history.present),
    future: Array.drop(history.future, 1),
  }));
