import { Effect, Option, Schema } from "effect";
import { Command, Dom } from "foldkit";

import { fileStem } from "./domain/naming";
import { DomainModelDocument, DomainModelDocumentJsonString } from "./domain/schema";
import { ExportFormat, Message } from "./message";
import * as Clipboard from "./platform/clipboard";
import * as Files from "./platform/files";
import * as Preferences from "./platform/preferences";
import * as AppWindow from "./platform/window";

// FILES

const encodeDocument = Schema.encodeEffect(DomainModelDocumentJsonString);
const decodeDocument = Schema.decodeUnknownEffect(DomainModelDocumentJsonString);

const suggestedFileName = (document: DomainModelDocument): string =>
  `${fileStem(document.name)}.domain.json`;

const writeDocument = (path: string, document: DomainModelDocument) =>
  Effect.gen(function* () {
    const json = yield* encodeDocument(document).pipe(
      Effect.mapError((error) => new Files.FileError({ reason: error.message })),
    );
    yield* Files.write(path, `${json}\n`);
    return Message.SucceededSaveFile({ document, path });
  });

const toFailureMessage =
  <FailureMessage>(toMessage: (error: string) => FailureMessage) =>
  (
    error: Files.PickerCancelled | Files.FileError,
  ): Effect.Effect<FailureMessage | typeof Message.CancelledFilePicker.Type> =>
    Effect.succeed(
      error._tag === "PickerCancelled" ? Message.CancelledFilePicker() : toMessage(error.reason),
    );

export const OpenFile = Command.define("OpenFile", {
  messages: [Message.SucceededOpenFile, Message.FailedOpenFile, Message.CancelledFilePicker],
  execute: Effect.gen(function* () {
    const path = yield* Files.pickToOpen;
    const text = yield* Files.read(path);
    const document = yield* decodeDocument(text).pipe(
      Effect.mapError(
        (error) => new Files.FileError({ reason: `Not a valid domain model: ${error.message}` }),
      ),
    );
    return Message.SucceededOpenFile({ document, path });
  }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedOpenFile({ error })))),
});

/** Writes straight to the active file; without one, falls back to Save As. */
export const SaveFile = Command.define("SaveFile", {
  args: { document: DomainModelDocument, maybePath: Schema.Option(Schema.String) },
  messages: [Message.SucceededSaveFile, Message.FailedSaveFile, Message.CancelledFilePicker],
  execute: ({ document, maybePath }) =>
    Effect.gen(function* () {
      const path = yield* Option.match(maybePath, {
        onNone: () => Files.pickToSave(suggestedFileName(document)),
        onSome: Effect.succeed,
      });
      return yield* writeDocument(path, document);
    }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedSaveFile({ error })))),
});

export const SaveFileAs = Command.define("SaveFileAs", {
  args: { document: DomainModelDocument },
  messages: [Message.SucceededSaveFile, Message.FailedSaveFile, Message.CancelledFilePicker],
  execute: ({ document }) =>
    Effect.gen(function* () {
      const path = yield* Files.pickToSave(suggestedFileName(document));
      return yield* writeDocument(path, document);
    }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedSaveFile({ error })))),
});

/** Reads the open file as it is on disk now. A file that can't be read counts
 *  as missing: it was deleted or moved, or is mid-replace. */
const readOnDisk = (path: string) =>
  Files.read(path).pipe(
    Effect.mapError(() => "Missing" as const),
    Effect.flatMap((text) => decodeDocument(text).pipe(Effect.mapError(() => "Invalid" as const))),
  );

/** Re-reads the open file after a change on disk or a return to the window. */
export const CheckFileOnDisk = Command.define("CheckFileOnDisk", {
  args: { path: Schema.String },
  messages: [Message.ReadFileOnDisk, Message.FailedReadFileOnDisk],
  execute: ({ path }) =>
    readOnDisk(path).pipe(
      Effect.map((document) => Message.ReadFileOnDisk({ path, document })),
      Effect.catch((issue) => Effect.succeed(Message.FailedReadFileOnDisk({ path, issue }))),
    ),
});

export const ReloadFileFromDisk = Command.define("ReloadFileFromDisk", {
  args: { path: Schema.String },
  messages: [Message.SucceededReloadFile, Message.FailedReloadFile],
  execute: ({ path }) =>
    readOnDisk(path).pipe(
      Effect.map((document) => Message.SucceededReloadFile({ path, document })),
      Effect.catch((issue) => Effect.succeed(Message.FailedReloadFile({ path, issue }))),
    ),
});

// EXPORT

const EXPORT_FILTERS: Record<ExportFormat, Files.FileFilter> = {
  Mermaid: Files.MERMAID_FILTER,
  EffectSchema: Files.EFFECT_SCHEMA_FILTER,
};

export const CopyExport = Command.define("CopyExport", {
  args: { text: Schema.String, format: ExportFormat },
  messages: [Message.SucceededCopyExport, Message.FailedCopyExport],
  execute: ({ text, format }) =>
    Clipboard.copy(text).pipe(
      Effect.as(Message.SucceededCopyExport({ format })),
      Effect.catch(({ reason }) =>
        Effect.succeed(Message.FailedCopyExport({ error: `Couldn't copy: ${reason}` })),
      ),
    ),
});

export const SaveExport = Command.define("SaveExport", {
  args: { text: Schema.String, fileName: Schema.String, format: ExportFormat },
  messages: [Message.SucceededSaveExport, Message.FailedSaveExport, Message.CancelledFilePicker],
  execute: ({ text, fileName, format }) =>
    Effect.gen(function* () {
      const path = yield* Files.pickToSave(fileName, EXPORT_FILTERS[format]);
      yield* Files.write(path, text);
      return Message.SucceededSaveExport({ path });
    }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedSaveExport({ error })))),
});

// WINDOW

/** Asks before discarding unsaved changes, then closes the window. */
export const ConfirmCloseWindow = Command.define("ConfirmCloseWindow", {
  messages: [Message.CompletedCloseWindow, Message.CancelledCloseWindow],
  execute: Effect.gen(function* () {
    if (!(yield* AppWindow.confirmDiscardChanges)) {
      return Message.CancelledCloseWindow();
    }
    yield* AppWindow.destroy;
    return Message.CompletedCloseWindow();
  }),
});

// PREFERENCES

export const RememberRecentCommands = Command.define("RememberRecentCommands", {
  args: { ids: Schema.Array(Schema.String) },
  messages: [Message.CompletedRememberRecentCommands],
  execute: ({ ids }) =>
    Preferences.saveRecentCommandIds(ids).pipe(
      Effect.as(Message.CompletedRememberRecentCommands()),
    ),
});

// FOCUS

export const RevealPickerOption = Command.define("RevealPickerOption", {
  messages: [Message.CompletedRevealPickerOption],
  execute: Dom.scrollIntoView('#picker-options [aria-selected="true"]', { block: "nearest" }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedRevealPickerOption()),
  ),
});

/** Focuses an input once the render has committed, then selects its text so
 *  typing replaces it. */
export const FocusInput = Command.define("FocusInput", {
  args: { selector: Schema.String },
  messages: [Message.CompletedFocusInput],
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(
      Effect.andThen(
        Effect.sync(() => {
          const element = document.querySelector(selector);
          if (element instanceof HTMLInputElement) {
            element.select();
          }
        }),
      ),
      Effect.ignore,
      Effect.as(Message.CompletedFocusInput()),
    ),
});
