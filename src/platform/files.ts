import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, watch, writeTextFile, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { Data, Effect, Queue, Stream } from "effect";

// Native dialogs pick a file and the fs plugin reads and writes it. Tauri
// grants the fs plugin access to exactly the paths the user picks, nothing
// else (see src-tauri/capabilities/default.json).

export class PickerCancelled extends Data.TaggedError("PickerCancelled")<{}> {}

export class FileError extends Data.TaggedError("FileError")<{ readonly reason: string }> {}

export type FileFilter = Readonly<{ name: string; extensions: ReadonlyArray<string> }>;

const MODEL_FILTER: FileFilter = { name: "Domain Model JSON", extensions: ["json"] };
export const MERMAID_FILTER: FileFilter = { name: "Mermaid diagram", extensions: ["mmd"] };
export const EFFECT_SCHEMA_FILTER: FileFilter = { name: "Effect Schema", extensions: ["ts"] };

const toDialogFilters = (filter: FileFilter) => [
  { name: filter.name, extensions: [...filter.extensions] },
];

const toFileError = (error: unknown): FileError =>
  new FileError({ reason: error instanceof Error ? error.message : String(error) });

const fromPromise = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({ try: evaluate, catch: toFileError });

const requireDesktop = Effect.suspend(() =>
  isTauri()
    ? Effect.void
    : Effect.fail(
        new FileError({ reason: "Files can only be opened and saved in the desktop app." }),
      ),
);

const picked = (path: string | null) =>
  path === null ? Effect.fail(new PickerCancelled()) : Effect.succeed(path);

/** Shows the native open dialog and resolves to the picked path. */
export const pickToOpen: Effect.Effect<string, PickerCancelled | FileError> = requireDesktop.pipe(
  Effect.andThen(
    fromPromise(() =>
      open({ multiple: false, directory: false, filters: toDialogFilters(MODEL_FILTER) }),
    ),
  ),
  Effect.flatMap(picked),
);

/** Shows the native save dialog and resolves to the chosen path. */
export const pickToSave = (
  defaultPath: string,
  filter: FileFilter = MODEL_FILTER,
): Effect.Effect<string, PickerCancelled | FileError> =>
  requireDesktop.pipe(
    Effect.andThen(fromPromise(() => save({ defaultPath, filters: toDialogFilters(filter) }))),
    Effect.flatMap(picked),
  );

export const read = (path: string): Effect.Effect<string, FileError> =>
  fromPromise(() => readTextFile(path));

export const write = (path: string, contents: string): Effect.Effect<void, FileError> =>
  fromPromise(() => writeTextFile(path, contents));

// WATCHING

/** How long the watcher waits for a burst of changes to settle. */
const WATCH_DELAY_MS = 300;
/** How often to retry watching a file that isn't there (deleted or mid-replace). */
const REWATCH_DELAY_MS = 2000;

/** While the Stream runs, emits once per settled burst of changes to the file
 *  at `path`. Many tools save by writing a new file and renaming it over the
 *  old one, which ends a watch on some platforms, so each burst re-arms the
 *  watch before it is reported: a read that follows can't miss a later change.
 *  Outside the desktop shell it never emits. */
export const changes = (path: string): Stream.Stream<void> =>
  isTauri()
    ? Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let maybeUnwatch: UnwatchFn | undefined;
            let maybeRetry: ReturnType<typeof setTimeout> | undefined;
            let isRearming = false;
            let isStopped = false;

            // A file that comes back after a failed watch counts as a change.
            const arm = (isRetry: boolean): Promise<void> =>
              watch(path, onEvent, { delayMs: WATCH_DELAY_MS }).then(
                (unwatch) => {
                  if (isStopped) return unwatch();
                  maybeUnwatch = unwatch;
                  if (isRetry) Queue.offerUnsafe(queue, undefined);
                },
                () => {
                  if (!isStopped) maybeRetry = setTimeout(() => void arm(true), REWATCH_DELAY_MS);
                },
              );

            // One burst can carry several events; they re-arm and report once.
            function onEvent(): void {
              if (isRearming || isStopped) return;
              isRearming = true;
              maybeUnwatch?.();
              maybeUnwatch = undefined;
              void arm(false).then(() => {
                isRearming = false;
                if (!isStopped) Queue.offerUnsafe(queue, undefined);
              });
            }

            void arm(false);
            return () => {
              isStopped = true;
              clearTimeout(maybeRetry);
              maybeUnwatch?.();
            };
          }),
          (stop) => Effect.sync(stop),
        ),
      )
    : Stream.empty;
