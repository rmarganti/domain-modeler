import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { Effect, Queue, Stream } from "effect";

// Outside the desktop shell (plain `pnpm dev` in a browser, tests) there is no
// native window, so every operation here degrades to a no-op.

/** While the Stream runs, intercepts the window's close button and emits
 *  `toValue()` instead of closing. */
export const closeRequests = <A>(toValue: () => A): Stream.Stream<A> =>
  isTauri()
    ? Stream.callback<A>((queue) =>
        Effect.acquireRelease(
          Effect.promise(() =>
            getCurrentWindow().onCloseRequested((event) => {
              event.preventDefault();
              Queue.offerUnsafe(queue, toValue());
            }),
          ),
          (unlisten) => Effect.sync(unlisten),
        ),
      )
    : Stream.empty;

export const setTitle = (title: string): Effect.Effect<void> =>
  isTauri() ? Effect.promise(() => getCurrentWindow().setTitle(title)) : Effect.void;

/** Asks whether to discard unsaved changes. */
export const confirmDiscardChanges: Effect.Effect<boolean> = Effect.promise(() =>
  ask("You have unsaved changes. Close without saving?", {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Close Without Saving",
    cancelLabel: "Cancel",
  }),
);

/** Closes the window without raising another close request. */
export const destroy: Effect.Effect<void> = isTauri()
  ? Effect.promise(() => getCurrentWindow().destroy())
  : Effect.void;
