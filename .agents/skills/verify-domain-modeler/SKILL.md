---
name: verify-domain-modeler
description: Launch an isolated Domain Modeler instance and drive the canvas editor like a user (entities, fields, relationships, undo/redo) with agent-browser, capturing proof. Use to confirm a UI change works in the real app, not just in vitest, or to smoke-check that the Tauri desktop shell boots.
---

# Verify Domain Modeler

Domain Modeler is a Foldkit (Elm Architecture) canvas editor that ships as a Tauri v2 desktop app. The desktop webview (WKWebView on macOS) cannot be scripted, so verification has two modes:

- **web** (default): the same frontend served by Vite and driven in Chromium through `agent-browser`. Covers everything except native file dialogs, window close prompts, and the window title.
- **desktop**: `tauri dev` on an isolated port. Proves the shell builds and the frontend boots inside it (the window title is set through Tauri IPC). It cannot be driven.

All commands run from the repo root. `S=.agents/skills/verify-domain-modeler/scripts`.

## Launch

```bash
S=.agents/skills/verify-domain-modeler/scripts
eval "$($S/verify.sh launch)"          # or: launch desktop
```

`launch` picks a free port from 1520 upward (never 1420, which the user's own `pnpm app:dev` owns), starts Vite, opens a dedicated `agent-browser` session at 1400×900, and returns only once the editor shows `Mode: NORMAL`. It exports:

- `VERIFY_RUN`: the run ID.
- `VERIFY_URL`: e.g. `http://localhost:1520`.
- `VERIFY_EVIDENCE`: `.verify/<run>/evidence`, where proof goes.
- `AGENT_BROWSER_SESSION`: web mode only. Every `agent-browser` command then targets this run's browser.

The app needs no data dir, seed, or auth: every launch starts from the built-in `Blog` sample (User, Post, Tag; relationships `writes` 1:N and `tagged` N:M). A page reload resets to it.

Desktop launch waits for `runtime connected` in `.verify/<run>/state/server.log` and then for a window titled `Blog — Domain Modeler`. The first cold Rust build takes minutes; incremental ones take seconds.

Requires `pnpm install` done, `agent-browser` on PATH, and `swift` (Xcode CLT) for the desktop window check.

## Doctor

```bash
$S/verify.sh doctor
```

Read-only. Checks the process is up, this run owns the port, the server answers, the build revision vs. HEAD, and either the browser session URL plus editor mode (web) or the window title (desktop). Exits non-zero on any failure. Run it first whenever something looks off; if it fails, clean up and relaunch rather than driving a half-dead instance.

## Drive

Use `agent-browser` (`agent-browser skills get core` for its reference). Handles, in order of preference:

| Target | Handle |
| --- | --- |
| Editor mode | `get attr '[aria-label^="Mode:"]' aria-label` → `Mode: NORMAL`, `CREATING`, `EDITING`, `CONNECTING`, `MOVING`, `PANNING` |
| Canvas | `[aria-label="Domain model canvas"]` (role `application`) |
| Entity card | `[aria-label="Entity <Name>"]`, also `[data-entity-id="<id>"]` |
| Entity buttons | inside a card: `Expand` / `Collapse`, `Delete <Name>`; `+ Add field` has no aria-label (see below) |
| Field rows | `li` inside a card; editor inputs `[aria-label="Field name"]`, `[aria-label="Field type"]` (select), checkboxes `Primary key`, `Nullable`, `Optional`; row buttons `Move up`, `Move down` |
| New entity input | `[aria-label="New entity name"]` |
| Ports | `[aria-label="Entity <Name>"] [data-port]` |
| Edges | buttons `Relationship <name> <cardinality>`, e.g. `Relationship writes 1:N` |
| Relationship inspector | dialog `Relationship inspector`, textbox `Relationship name`, radiogroup `Cardinality` with radios `1:1`, `1:N`, `N:M` |
| Toolbar | `New model`, `Open`, `Save`, `Save as`, textbox `Model name`, `Undo`, `Redo`, `+ Entity` (text only) |
| View HUD | toolbar `View controls`: `Zoom out`, `Zoom in`, `Reset view to 100%`, `Fit to screen` |
| Notices | `[role="alert"]` (errors), `[role="status"]`, dismiss with `[aria-label="Dismiss"]` |

Buttons without an aria-label, or ones repeated across cards, are clicked by scoped ref: `agent-browser snapshot -i -s '[aria-label="Entity Comment"]'`, then `agent-browser click @eN`. A global `find text "+ Add field" click` hits the first card on the page, not the one you mean.

Keyboard (Normal mode): `c` create, `d`/`Delete`/`Backspace` delete selection, `u` or `Meta+z` undo, `Control+r` or `Meta+Shift+z` redo, `Enter`/`i` expand and edit selection, `Escape` deselect. In text modes `Enter` commits and `Escape` cancels.

Pointer gestures (ports, node drag, pan) need real mouse events: `agent-browser get box <sel>`, then `mouse move`, `mouse down`, `mouse move` (at least one intermediate move), `mouse up`.

The feature map in [`features/`](features/README.md) has the recipes. Read its README before driving.

## Evidence

Write everything under `$VERIFY_EVIDENCE/<feature-id>/`:

- `agent-browser screenshot $VERIFY_EVIDENCE/<id>/<step>.png` after the action and after the resulting state.
- `agent-browser snapshot -c > $VERIFY_EVIDENCE/<id>/<step>.aria.txt` as the assertable record.
- For text assertions, `agent-browser get text '<sel>'` output, saved alongside.
- Desktop mode: `$S/verify.sh doctor > $VERIFY_EVIDENCE/desktop/doctor.txt` (window title). Window screenshots via `screencapture -l` come back with a black content area, so they are not proof.

Proof standards:

- Drive the user path (keys, clicks, drags), never `agent-browser eval` to dispatch messages or poke state. `eval` is fine for reading.
- Capture the action and the resulting state, not only the final screen.
- Confirm a mutation through a second view: the change survives `Escape`/collapse/re-expand, undo removes it, and redo restores it.
- Check `agent-browser errors` at the end and include it; an uncaught error fails the run even if the screen looks right.
- Web mode cannot prove file open/save, close confirmation, or window title. Report those as unverified, never as passing through another path.

## Cleanup

```bash
$S/verify.sh cleanup
```

Closes this run's browser session, kills the process tree `launch` started (by recorded PID, never by name), and deletes `.verify/<run>/state`. Evidence in `.verify/<run>/evidence` stays; `.verify/` is gitignored. Run cleanup after failed attempts too.

## Helpers

- `scripts/verify.sh launch [web|desktop] | doctor | cleanup`: the lifecycle above. `doctor` and `cleanup` read `VERIFY_RUN` from the environment, so keep the exports from `launch` in the same shell, or set `VERIFY_RUN=<run>` by hand.
- `scripts/window-title.swift <pid,...>`: prints the on-screen window title owned by those PIDs. Used by `doctor` in desktop mode.
