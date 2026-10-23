import { Effect } from "effect";

// App-wide preferences in the webview's localStorage, which survives restarts.
// Storage can be missing or throw (private mode, tests), so reads fall back to
// a default and writes are best-effort.

const RECENT_COMMANDS_KEY = "domain-modeler.recent-commands";

/** The command palette's recent command ids, most recent first. */
export const loadRecentCommandIds = (): ReadonlyArray<string> => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export const saveRecentCommandIds = (ids: ReadonlyArray<string>): Effect.Effect<void> =>
  Effect.sync(() => {
    try {
      localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids));
    } catch {
      // Recents are a convenience; losing them is harmless.
    }
  });
