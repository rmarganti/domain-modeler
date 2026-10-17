import { Data, Effect, Option, Schema } from "effect";
import { Command, Dom } from "foldkit";

import { DomainModelDocument, DomainModelDocumentJsonString } from "./domain/schema";
import { Message } from "./message";

// FILE SYSTEM ACCESS
// The active FileSystemFileHandle is a live browser object that cannot be
// serialized into the Model, so it is retained in runtime memory here. The
// Model only records the file's name.

type FilePickerAcceptType = Readonly<{
  description: string;
  accept: Record<string, ReadonlyArray<string>>;
}>;

type WritableFileHandle = FileSystemFileHandle &
  Readonly<{
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;

type FileSystemAccessWindow = Window &
  Readonly<{
    showOpenFilePicker?: (options: {
      types: ReadonlyArray<FilePickerAcceptType>;
      multiple?: boolean;
    }) => Promise<ReadonlyArray<WritableFileHandle>>;
    showSaveFilePicker?: (options: {
      types: ReadonlyArray<FilePickerAcceptType>;
      suggestedName?: string;
    }) => Promise<WritableFileHandle>;
  }>;

const FILE_TYPES: ReadonlyArray<FilePickerAcceptType> = [
  {
    description: "Domain Model JSON",
    accept: { "application/json": [".json", ".domain.json"] },
  },
];

let maybeActiveHandle: Option.Option<WritableFileHandle> = Option.none();

const fileSystemWindow = (): FileSystemAccessWindow => window;

class PickerCancelled extends Data.TaggedError("PickerCancelled")<{}> {}

class FileError extends Data.TaggedError("FileError")<{ readonly reason: string }> {}

const toFileError = (error: unknown): PickerCancelled | FileError =>
  error instanceof DOMException && error.name === "AbortError"
    ? new PickerCancelled()
    : new FileError({ reason: error instanceof Error ? error.message : String(error) });

const fromPromise = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({ try: evaluate, catch: toFileError });

const UNSUPPORTED = new FileError({
  reason: "This browser does not support the File System Access API. Try Chrome or Edge.",
});

const pickFileToOpen = Effect.suspend(() => {
  const picker = fileSystemWindow().showOpenFilePicker;
  return picker === undefined
    ? Effect.fail(UNSUPPORTED)
    : fromPromise(() => picker({ types: FILE_TYPES, multiple: false }));
});

const pickFileToSave = (suggestedName: string) =>
  Effect.suspend(() => {
    const picker = fileSystemWindow().showSaveFilePicker;
    return picker === undefined
      ? Effect.fail(UNSUPPORTED)
      : fromPromise(() => picker({ types: FILE_TYPES, suggestedName }));
  });

const encodeDocument = Schema.encodeEffect(DomainModelDocumentJsonString);
const decodeDocument = Schema.decodeUnknownEffect(DomainModelDocumentJsonString);

const writeDocument = (handle: WritableFileHandle, document: DomainModelDocument) =>
  Effect.gen(function* () {
    const json = yield* encodeDocument(document).pipe(
      Effect.mapError((error) => new FileError({ reason: error.message })),
    );
    const writable = yield* fromPromise(() => handle.createWritable());
    yield* fromPromise(() => writable.write(`${json}\n`));
    yield* fromPromise(() => writable.close());
    maybeActiveHandle = Option.some(handle);
    return Message.SucceededSaveFile({ fileName: handle.name });
  });

const toFailureMessage =
  <FailureMessage>(toMessage: (error: string) => FailureMessage) =>
  (
    error: PickerCancelled | FileError,
  ): Effect.Effect<FailureMessage | typeof Message.CancelledFilePicker.Type> =>
    Effect.succeed(
      error._tag === "PickerCancelled" ? Message.CancelledFilePicker() : toMessage(error.reason),
    );

const suggestedFileName = (document: DomainModelDocument): string => {
  const slug = document.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug === "" ? "untitled" : slug}.domain.json`;
};

export const OpenFile = Command.define("OpenFile", {
  messages: [Message.SucceededOpenFile, Message.FailedOpenFile, Message.CancelledFilePicker],
  execute: Effect.gen(function* () {
    const handles = yield* pickFileToOpen;
    const handle = handles[0];
    if (handle === undefined) {
      return Message.CancelledFilePicker();
    }
    const file = yield* fromPromise(() => handle.getFile());
    const text = yield* fromPromise(() => file.text());
    const document = yield* decodeDocument(text).pipe(
      Effect.mapError(
        (error) => new FileError({ reason: `Not a valid domain model: ${error.message}` }),
      ),
    );
    maybeActiveHandle = Option.some(handle);
    return Message.SucceededOpenFile({ document, fileName: handle.name });
  }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedOpenFile({ error })))),
});

/** Writes straight to the active handle; without one, falls back to Save As. */
export const SaveFile = Command.define("SaveFile", {
  args: { document: DomainModelDocument },
  messages: [Message.SucceededSaveFile, Message.FailedSaveFile, Message.CancelledFilePicker],
  execute: ({ document }) =>
    Effect.gen(function* () {
      const handle = yield* Option.match(maybeActiveHandle, {
        onNone: () => pickFileToSave(suggestedFileName(document)),
        onSome: Effect.succeed,
      });
      return yield* writeDocument(handle, document);
    }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedSaveFile({ error })))),
});

export const SaveFileAs = Command.define("SaveFileAs", {
  args: { document: DomainModelDocument },
  messages: [Message.SucceededSaveFile, Message.FailedSaveFile, Message.CancelledFilePicker],
  execute: ({ document }) =>
    Effect.gen(function* () {
      const handle = yield* pickFileToSave(suggestedFileName(document));
      return yield* writeDocument(handle, document);
    }).pipe(Effect.catch(toFailureMessage((error) => Message.FailedSaveFile({ error })))),
});

export const ForgetFileHandle = Command.define("ForgetFileHandle", {
  messages: [Message.CompletedForgetFileHandle],
  execute: Effect.sync(() => {
    maybeActiveHandle = Option.none();
    return Message.CompletedForgetFileHandle();
  }),
});

// FOCUS

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
