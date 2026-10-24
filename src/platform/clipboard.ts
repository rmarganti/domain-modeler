import { isTauri } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Data, Effect } from "effect";

// The desktop shell writes through the clipboard plugin; the browser build
// falls back to the web Clipboard API.

export class ClipboardError extends Data.TaggedError("ClipboardError")<{
  readonly reason: string;
}> {}

export const copy = (text: string): Effect.Effect<void, ClipboardError> =>
  Effect.tryPromise({
    try: () => (isTauri() ? writeText(text) : navigator.clipboard.writeText(text)),
    catch: (error) =>
      new ClipboardError({ reason: error instanceof Error ? error.message : String(error) }),
  });
