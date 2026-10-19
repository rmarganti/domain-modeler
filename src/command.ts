import { Effect, Option, Schema } from "effect";
import { Command, Dom } from "foldkit";

import { DomainModelDocument, DomainModelDocumentJsonString } from "./domain/schema";
import { Message } from "./message";
import * as Files from "./platform/files";
import * as AppWindow from "./platform/window";

// FILES
// The active file's path is runtime state outside the Model, so Save can
// write back to it; the Model only records the file's name.

let maybeActivePath: Option.Option<string> = Option.none();

const encodeDocument = Schema.encodeEffect(DomainModelDocumentJsonString);
const decodeDocument = Schema.decodeUnknownEffect(DomainModelDocumentJsonString);

const suggestedFileName = (document: DomainModelDocument): string => {
  const slug = document.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug === "" ? "untitled" : slug}.domain.json`;
};

const writeDocument = (path: string, document: DomainModelDocument) =>
  Effect.gen(function* () {
    const json = yield* encodeDocument(document).pipe(
      Effect.mapError((error) => new Files.FileError({ reason: error.message })),
    );
    yield* Files.write(path, `${json}\n`);
    maybeActivePath = Option.some(path);
    return Message.SucceededSaveFile({ document, fileName: Files.fileNameOf(path) });
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
    maybeActivePath = Option.some(path);
    return Message.SucceededOpenFile({ document, fileName: Files.fileNameOf(path) });
  }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedOpenFile({ error })))),
});

/** Writes straight to the active file; without one, falls back to Save As. */
export const SaveFile = Command.define("SaveFile", {
  args: { document: DomainModelDocument },
  messages: [Message.SucceededSaveFile, Message.FailedSaveFile, Message.CancelledFilePicker],
  execute: ({ document }) =>
    Effect.gen(function* () {
      const path = yield* Option.match(maybeActivePath, {
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

export const ForgetActiveFile = Command.define("ForgetActiveFile", {
  messages: [Message.CompletedForgetActiveFile],
  execute: Effect.sync(() => {
    maybeActivePath = Option.none();
    return Message.CompletedForgetActiveFile();
  }),
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

// FOCUS

export const RevealCardOption = Command.define("RevealCardOption", {
  messages: [Message.CompletedRevealCardOption],
  execute: Dom.scrollIntoView('#card-options [aria-selected="true"]', { block: "nearest" }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedRevealCardOption()),
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
