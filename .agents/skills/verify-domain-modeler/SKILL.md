---
name: verify-domain-modeler
description: Launch an isolated Domain Modeler instance and drive the canvas editor like a user (entities, fields, relationships, undo/redo) with agent-browser, capturing proof. Use to confirm a UI change works in the real app, not just in vitest, or to smoke-check that the Tauri desktop shell boots.
---

# Verify Domain Modeler

Domain Modeler is a Foldkit (Elm Architecture) canvas editor that ships as a Tauri v2 desktop app. The desktop webview (WKWebView on macOS) cannot be scripted, so verification has two modes:

- **web** (default): the same frontend served by Vite and driven in Chromium through `agent-browser`. Covers everything except native file dialogs, window close prompts, and the window title.
- **desktop**: `tauri dev` on an isolated port. Proves the shell builds and the frontend boots inside it (the window title is set through Tauri IPC). It cannot be driven.

All commands run from the repo root and are literal: no shell variables, `eval`, or `source` needed. The helper is `.agents/skills/verify-domain-modeler/scripts/verify.sh`. In this skill and the feature map, **`ab …` is shorthand for `.agents/skills/verify-domain-modeler/scripts/verify.sh ab …`**: `agent-browser` aimed at this run's browser session.

## Launch

```bash
.agents/skills/verify-domain-modeler/scripts/verify.sh launch          # or: launch desktop
```

`launch` picks a free port from 1520 upward (never 1420, which the user's own `pnpm app:dev` owns), starts Vite, opens a dedicated `agent-browser` session at 1400×900, and returns only once the editor shows `Mode: NORMAL`. It points `.verify/latest` at the new run, and `ab`, `doctor`, and `cleanup` act on that run unless `VERIFY_RUN=<run>` is set. It also prints `export VERIFY_*` lines; using them is optional.

The app needs no data dir, seed, or auth: every launch starts from the built-in `Blog` sample (User, Post, Tag; relationships `writes` User `1` ── `0..*` Post and `tagged` Post `0..*` ── `0..*` Tag; `User.email` and `Tag.label` are `UQ`, `User.displayName` and `Post.publishedAt` are `0..1`; a collapsed `Role` enum card with values `reader`, `author`, `admin`). `ab reload` resets to it.

Desktop launch waits for `runtime connected` in `.verify/<run>/state/server.log` and then for a window titled `Blog — Domain Modeler`. The first cold Rust build takes minutes; incremental ones take seconds.

Requires dependencies installed (`pnpm install`, or any `pnpm` script, which installs them on first run), `agent-browser` on PATH, and `swift` (Xcode CLT) for the desktop window check.

## Doctor

```bash
.agents/skills/verify-domain-modeler/scripts/verify.sh doctor
```

Read-only. Checks the process is up, this run owns the port, the server answers, and either the browser session URL plus editor mode (web) or the window title (desktop). The `build` line says what is running: in web mode Vite serves the working tree live, so it reports HEAD plus whether there are uncommitted changes; in desktop mode it reports the commit at launch. Exits non-zero on any failure. Run it first whenever something looks off; if it fails, clean up and relaunch rather than driving a half-dead instance.

## Drive

Use `ab` (`agent-browser skills get core` for the command reference). Handles, in order of preference:

| Target                 | Handle                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor mode            | `ab get attr '[aria-label^="Mode:"]' aria-label` → `Mode: NORMAL`, `CREATING`, `EDITING`, `CONNECTING`, `MOVING`, `PANNING`                                                                                                                                                                                                                                                 |
| Canvas                 | `[aria-label="Domain model canvas"]` (role `application`)                                                                                                                                                                                                                                                                                                                   |
| Entity card            | `[aria-label="Entity <Name>"]`, also `[data-entity-id="<id>"]`                                                                                                                                                                                                                                                                                                              |
| Entity buttons         | inside a card: `Expand` / `Collapse`, `Delete <Name>`; `+ Add field` has no aria-label (see below)                                                                                                                                                                                                                                                                          |
| Field rows             | `li` inside a card; a row shows name, type, a multiplicity badge when not `1` (`0..1`, `0..*`, `1..*`) and `UQ` when unique; editor inputs `[aria-label="Field name"]`, `[aria-label="Field type"]` (select), `[aria-label="Field multiplicity"]` (select: `1`, `0..1`, `0..*`, `1..*`), checkbox `Unique` (disabled for `0..*`/`1..*`); row buttons `Move up`, `Move down` |
| Enum card              | `[aria-label="Enum <Name>"]`, also `[data-type-id="<id>"]` (never `data-entity-id`; no ports). Header: `enum` badge, value count, `Expand` / `Collapse`; double-click the name for textbox `Enum name`. Footer: `+ Add value` (no aria-label) and `Delete <Name>`                                                                                                           |
| Enum values            | `li` inside an enum card: value name, then its description; row buttons `Move up`, `Move down`, `Edit value`, `Delete value`; clicking a row opens the editor with inputs `[aria-label="Value name"]` and `[aria-label="Value description"]` (Enter saves, Escape cancels)                                                                                                  |
| New enum input         | `[aria-label="New enum name"]`                                                                                                                                                                                                                                                                                                                                              |
| New entity input       | `[aria-label="New entity name"]`                                                                                                                                                                                                                                                                                                                                            |
| Ports                  | `[aria-label="Entity <Name>"] [data-port]`: exactly two per card (left and right of the header), collapsed or expanded                                                                                                                                                                                                                                                      |
| Edges                  | buttons `Relationship <name> <end 1>:<end 2>`, e.g. `Relationship writes 1:0..*`; unnamed: `Relationship 1:0..*`; `⚠` inside when the edge has diagnostics                                                                                                                                                                                                                  |
| Relationship inspector | dialog `Relationship inspector`: textbox `Relationship name`, textarea `Relationship description`, and per end textbox `Role at <Entity>` (placeholder = default role) and radiogroup `Multiplicity at <Entity>` with radios `1`, `0..1`, `0..*`, `1..*`; a self association adds ` (end 1)` / ` (end 2)` to both labels; buttons `Delete relationship`, `Close`            |
| Toolbar                | `New model`, `Open`, `Save`, `Save as`, textbox `Model name`, `Undo`, `Redo`, `+ Entity` (title `Create entity (c)`), `+ Enum` (aria-label and title `Create enum`)                                                                                                                                                                                                         |
| View HUD               | toolbar `View controls`: `Zoom out`, `Zoom in`, `Reset view to 100%`, `Fit to screen`                                                                                                                                                                                                                                                                                       |
| Notices                | `[role="alert"]` (errors), `[role="status"]`, dismiss with `[aria-label="Dismiss"]`                                                                                                                                                                                                                                                                                         |

Buttons without an aria-label, or ones repeated across cards, are clicked by scoped ref: `ab snapshot -i -s '[aria-label="Entity Comment"]'`, then `ab click @eN`. A global `ab find text "+ Add field" click` (or `"+ Add value"`) hits the first card on the page, not the one you mean.

Keyboard (Normal mode): `c` create, `d`/`Delete`/`Backspace` delete selection (entity, enum, or edge), `u` or `Meta+z` undo, `Control+r` or `Meta+Shift+z` redo, `Enter`/`i` expand and edit selection, `Escape` deselect. In text modes `Enter` commits and `Escape` cancels.

Pointer gestures (ports, node drag, pan) need real mouse events: `ab get box <sel>`, then `ab mouse move`, `ab mouse down`, `ab mouse move` (at least one intermediate move), `ab mouse up`.

For a multi-step journey, put the `ab` lines in a script under `.verify/latest/evidence/<feature-id>/` and run it with `bash`; it doubles as a record of exactly what was driven.

The feature map in [`features/`](features/README.md) has the recipes. Read its README before driving.

## Evidence

Write everything under `.verify/latest/evidence/<feature-id>/`:

- `ab screenshot .verify/latest/evidence/<id>/<step>.png` after the action and after the resulting state. `ab` turns relative screenshot paths into absolute ones; plain `agent-browser screenshot <relative path>` silently saves under `~/.agent-browser/` instead.
- `ab snapshot -c > .verify/latest/evidence/<id>/<step>.aria.txt` as the assertable record.
- For text assertions, `ab get text '<sel>'` output, saved alongside.
- Desktop mode: `.agents/skills/verify-domain-modeler/scripts/verify.sh doctor > .verify/latest/evidence/desktop/doctor.txt` (window title). Window screenshots via `screencapture -l` come back with a black content area, so they are not proof.

When reporting, cite the resolved path `.verify/<run>/evidence/...` (doctor prints it), since `latest` moves on the next launch.

Proof standards:

- Drive the user path (keys, clicks, drags), never `ab eval` to dispatch messages or poke state. `eval` is fine for reading.
- Capture the action and the resulting state, not only the final screen.
- Confirm a mutation through a second view: the change survives `Escape`/collapse/re-expand, undo removes it, and redo restores it.
- Check `ab errors` at the end and include it; an uncaught error fails the run even if the screen looks right.
- Web mode cannot prove file open/save, close confirmation, or window title. Report those as unverified, never as passing through another path.

## Cleanup

```bash
.agents/skills/verify-domain-modeler/scripts/verify.sh cleanup
```

Closes this run's browser session, kills the process tree `launch` started (by recorded PID, never by name), and deletes `.verify/<run>/state`. Evidence in `.verify/<run>/evidence` stays; `.verify/` is gitignored. Run cleanup after failed attempts too.

## Helpers

- `scripts/verify.sh launch [web|desktop] | ab <agent-browser args> | doctor | cleanup`: the lifecycle above. All but `launch` act on `$VERIFY_RUN` if set, else `.verify/latest`.
- `scripts/window-title.swift <pid,...>`: prints the on-screen window title owned by those PIDs. Used by `doctor` in desktop mode.
