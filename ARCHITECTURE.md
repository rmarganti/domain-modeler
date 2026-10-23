# Domain Modeler Architecture

A canvas editor for domain models (entities, enums, associations), built on Foldkit (The Elm Architecture on Effect) and shipped as a Tauri v2 desktop app. This file records the decisions and invariants the code doesn't state on its own. For shapes, read the code: `src/domain/schema.ts` (file format), `src/model.ts` (editor state), `src/keymap.ts` (shortcuts).

## Code map

- `src/domain/`: pure document logic. It imports only `effect`, `pluralize`, and other domain modules: schema, document edits, history, diagnostics, naming, geometry, edge routing, fuzzy matching, card search, auto-arrange.
- `src/update/`: one module per feature area, called by `src/update.ts`.
- `src/view/`: rendering. Entity and enum cards share chrome in `card.ts`.
- `src/platform/`: the only code that touches Tauri (files, file watching, window close).
- `src/keymap.ts` + `src/subscription.ts`: every keyboard binding.

## Domain model

- **Entity-first.** An association connects two entities and never individual attributes. Identity is implicit: there are no ID attributes or primary-key flags, and business keys use `unique`. Foreign keys and join tables are for future exporters to derive.
- **Associations have no direction.** Both ends are navigable. `name` is only a display verb, and `ends[0]` is the entity the user dragged from. New associations are `1 ── 0..*`.
- **Multiplicity reads UML-style.** The multiplicity on `ends[i]` is how many of `ends[i]`'s entity exist per one of the other entity, so in `User 1 ── 0..* Post` a User has many Posts. Attributes reuse the same four values: `0..1` is optional, and a `many` max is a list.
- **Roles are derived, never stored.** The role on `ends[i]` is what the other entity calls `ends[i]`'s entity. If blank, it's the camelCased entity name, pluralized when the max is `many`. Only `naming.ts` knows about plurals.
- **Enums** live in top-level `types`, with a `kind` discriminator so value objects can join later. Only attributes typed `{ typeId }` point at them. Deleting an enum leaves those attributes dangling, a diagnostic flags them, and undo is the recovery path.
- **A list can't be `unique`.** The document API forces `unique: false` when the max is `many`.
- **Names:** entity and enum names share one case-insensitive namespace.
- **Vocabulary:** code and the file format say "association" and "attribute"; the UI says "Relationship" and "field".
- **IDs are random and opaque.** New IDs are 10 random lowercase letters and digits from a seeded generator (`ids.ts`) whose state lives in the Model, outside the document and history, so `update` stays pure and undo never rewinds it. An ID is never reused, so a merge can trust that the same ID means the same thing. Code never reads meaning into an ID, and older files with IDs like `e1` keep working.
- **File format:** the version stays `1.0.0` while the project is early. The schema changes in place, with no migrations.
- **JSON Schema:** `schema/domain-model.schema.json` is generated from `schema.ts` for agents and editors, and its descriptions come from the schema's annotations. A test fails when the two drift, and `pnpm schema:generate` rewrites it. It checks shape only. Rules that span the document, like references resolving, stay in diagnostics. Saved files lead with `"$schema": SCHEMA_URL`, the raw GitHub URL of that file on `main`. `$schema` exists only in the file codec (`DomainModelFile`): loading ignores whatever value is there, and `DomainModelDocument` never carries it.

## Layout is separate from semantics

`layout` (card positions, expansion, viewport) is kept apart from the domain sections so external consumers see a clean schema. `layout.nodes` is keyed by entity or type ID. Reconciliation keeps these true:

- every entity and enum has a node, and a missing one gets a non-overlapping position;
- no node is left for a deleted card;
- association ends reference existing entities. A stale edge is surfaced as a diagnostic, never dropped.

## Editor state

- Modes are a tagged union (`EditorState`), and selection is a separate one (`Selection` with a `CardRow` cursor). Don't add boolean flags.
- Row cursors use IDs, not indexes, so they survive reordering. `reconcile` repairs selection after every document change and history restore.
- Diagnostics (`diagnostics.ts`) never block editing. They are recomputed from the document and shown as badges, so loading an invalid file still works.

## Undo / redo

`History` is a snapshot zipper of whole documents, capped at 50. Only discrete edits push a snapshot. Drag moves, pans, zooms, selection, and camera moves never do. A completed drag is one entry.

A compound action is one entry. "New enum…" from a field creates the enum, retypes the field, and names the first value in one snapshot: the value edit uses `save: "Amend"`, so one `u` undoes it all.

## Messages

A message records what happened, in the past tense. It is never a command, so there are no names like `ZoomIn` or `SetName`. `update` decides what a message means.

- **Name the input when its meaning or data is specific to that input.** Use `Clicked…`, `Pressed…Key`, or the gesture (`MovedCardRow`). That covers keys whose meaning depends on mode or selection (`PressedEnterKey`, `PressedEscapeKey`), and controls that carry their own target where the key acts on the selection (`ClickedToggleExpand { nodeId }` vs `PressedToggleExpandKey`). Each input gets its own message, and both call the same update function.
- **Share one `Requested…` message when a key and a control do exactly the same thing with the same data**: `RequestedSave`, `RequestedUndo`, `RequestedZoomIn`. A key never sends a `Clicked…` message, and a control never sends a `Pressed…` message.

## Keyboard

- `src/keymap.ts` is the single source of truth. Each entry owns its keys, message, modes, description, and typing policy, and the help dialog and toolbar titles are built from it. Add shortcuts there, nowhere else. A test requires every entry to appear in help.
- Foldkit matches `event.key` and Shift exactly. Shifted keys need their produced character as an alias (`Shift+1` / `Shift+!`, `?` / `Shift+?`); `displayKeys` hides the alias.
- On non-Apple platforms, the command palette is `Ctrl+Shift+K` (`otherKeys`), keeping `Ctrl+K` free for spatial navigation. Find card is `Mod+P` everywhere.
- Tauri's `zoomHotkeysEnabled` stays off so `Mod+=` / `Mod+-` / `Mod+0` reach the app instead of zooming the webview.

## Pickers and the command palette

Find card (`Mod+P`), Connect to… (`r`), and the command palette (`Mod+K`) are one editor state, `Picking`, with a `PickerPurpose`. They share the query, highlight, `Picking` key mode, messages, and overlay. Only the options and what picking one does differ. All of them rank with `fuzzyMatch` (`fuzzy.ts`).

- **Commands** live in `PALETTE_COMMANDS` (`update/palette.ts`): an id, label, group, aliases, the keymap entry whose keys to show, an availability check, and the update to run. Picking from the palette sends `PickedOption`, never a key's `Pressed…` message, and runs the update directly.
- **Commands that don't apply are hidden**, not disabled: selection commands without a selection, Undo with nothing to undo, Reload without a file.
- **Aliases** rank below every label match, and the row shows the alias that matched.
- **Recents** are command ids, newest first, capped at 5. They're app-wide, not per model, and are kept in `localStorage`: read once into the flags, written by a command after each run. Unknown ids are dropped on load, so renaming a command id only forgets it.

## Persistence

Native open and save dialogs go through the Tauri dialog and fs plugins. The open file's path lives in the Model (`maybeFilePath`), so Save writes back to it and the watch subscription is keyed on it. Capabilities are least-privilege: there is no standing fs scope, and the dialog grants access to exactly the paths the user picks, which is also all that can be watched. Closing with unsaved changes asks for confirmation.

Unsaved state isn't stored as a flag. The Model keeps the saved document (as last read from or written to disk), and `isDirty` compares the present document against it, so undoing back to the saved state reads as clean. Pan, zoom, and card expansion don't count as changes. The saved document is also the base for merging external edits to the open file.

## External edits

Coding agents, git, and editors change the open file on disk, and the app merges those changes in without losing unsaved work.

- **Detecting.** A subscription keyed on `maybeFilePath` watches that one file (fs plugin `watch`, 300 ms debounce). Each burst re-arms the watch before it's reported, since saving by renaming a new file over the old one ends a watch on some platforms. Regaining window focus re-checks the file too, as a backstop. Either way the file is read, decoded, and synced with `Doc.syncLayout` so it compares with the saved document.
- **Base = saved document.** A version equal to the saved document is ignored, which covers our own saves. Anything else becomes `maybePendingDiskDocument`, and a newer one replaces it.
- **Hold while busy.** `update` merges the pending version after every message, but only while the editor is `Idle` or `ViewingShortcuts`. Editing text, dragging, panning, connecting, picking, and inspecting a relationship hold it. Save merges it first, so a save never overwrites it.
- **Merging.** `merge(saved, present, theirs)`: ours wins every conflict and the viewport is always ours. The result is one history entry, so `u` restores exactly the document from before it, and the saved document becomes theirs. A notice says "Updated from…", or names what kept your version.
- **Reload from disk** (`Shift+R`) replaces the document with the file's version as one undoable entry, discarding unsaved changes and anything pending.
- **Problems.** An invalid file gets one error notice while it stays invalid, and the document is kept. A file that can't be read (deleted, moved) gets one notice and clears the saved document, so the model reads as unsaved and Save writes it back. Without a saved document there's no base to merge from: a differing file only gets a notice pointing at Reload from disk, and the same content counts as saved again.

## Edge routing

Edges are drawn through the `EdgeRouter` interface (`edgeRouter.ts`), with cubic Bézier by default, so an orthogonal router can replace it without touching views. Edges anchor at card headers. Each card has exactly two header ports, and enum cards have none, so they aren't drop targets.

## Auto-arrange

`arrange` (`arrange.ts`) lays the cards out in left-to-right columns at their current sizes, as one undoable edit, and the update then fits them on screen. Columns run left to right because edges leave card headers sideways. The engine (`layered.ts`) is our own small layered layout, built after studying [pele](https://github.com/obsidianmd/pele)'s, but none of pele's code is copied. It only places boxes. Edges stay with the `EdgeRouter`.

- **Direction comes from multiplicity.** An association's one end goes before its many end, so owners come before what they own. Otherwise `ends[0]` comes first. Enums come after the entities whose fields use them.
- **Headers line up, not centers**, because that's where edges attach. Each node moves toward the average header height of its neighbors, weighted by edge count. That minimizes total edge slope, so the passes settle.
- **Deterministic.** Ties keep document order, so the same document always arranges the same way.
- **Disconnected parts** are laid out separately and wrapped into rows, largest first. The arranged cards start at the old top-left corner.
