import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Data, Effect } from "effect";

// Native dialogs pick a file and the fs plugin reads and writes it. Tauri
// grants the fs plugin access to exactly the paths the user picks, nothing
// else (see src-tauri/capabilities/default.json).

export class PickerCancelled extends Data.TaggedError("PickerCancelled")<{}> {}

export class FileError extends Data.TaggedError("FileError")<{ readonly reason: string }> {}

const FILTERS = [{ name: "Domain Model JSON", extensions: ["json"] }];

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
  Effect.andThen(fromPromise(() => open({ multiple: false, directory: false, filters: FILTERS }))),
  Effect.flatMap(picked),
);

/** Shows the native save dialog and resolves to the chosen path. */
export const pickToSave = (
  defaultPath: string,
): Effect.Effect<string, PickerCancelled | FileError> =>
  requireDesktop.pipe(
    Effect.andThen(fromPromise(() => save({ defaultPath, filters: FILTERS }))),
    Effect.flatMap(picked),
  );

export const read = (path: string): Effect.Effect<string, FileError> =>
  fromPromise(() => readTextFile(path));

export const write = (path: string, contents: string): Effect.Effect<void, FileError> =>
  fromPromise(() => writeTextFile(path, contents));

export const fileNameOf = (path: string): string => path.split(/[\\/]/).at(-1) ?? path;
