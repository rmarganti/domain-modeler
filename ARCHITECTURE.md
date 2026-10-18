# Domain Modeler Architecture

A canvas editor for domain models (entities, enums, associations), built on Foldkit (The Elm Architecture on Effect) and shipped as a Tauri v2 desktop app. This file records the decisions and invariants the code doesn't state on its own. For shapes, read the code: `src/domain/schema.ts` (file format), `src/model.ts` (editor state), `src/keymap.ts` (shortcuts).

## Code map

- `src/domain/`: pure document logic. It imports only `effect`, `pluralize`, and other domain modules: schema, document edits, history, diagnostics, naming, geometry, edge routing, card search.
- `src/update/`: one module per feature area, called by `src/update.ts`.
- `src/view/`: rendering. Entity and enum cards share chrome in `card.ts`.
- `src/platform/`: the only code that touches Tauri (files, window close).
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
- **ID prefixes:** IDs are derived from the document with one prefix per kind: `e` entity, `p` attribute, `t` type, `v` enum value, `r` association.
- **File format:** the version stays `1.0.0` while the project is early. The schema changes in place, with no migrations.

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

- `src/keymap.ts` is the single source of truth. Each entry owns its keys, message, modes, description, and typing policy, and the help dialog, toolbar titles, and hints are all built from it. Add shortcuts there, nowhere else. A test requires every entry to appear in help.
- Foldkit matches `event.key` and Shift exactly. Shifted keys need their produced character as an alias (`Shift+1` / `Shift+!`, `?` / `Shift+?`); `displayKeys` hides the alias.
- On non-Apple platforms, Find card is `Ctrl+Shift+K` (`otherKeys`), keeping `Ctrl+K` free for spatial navigation.
- Tauri's `zoomHotkeysEnabled` stays off so `Mod+=` / `Mod+-` / `Mod+0` reach the app instead of zooming the webview.

## Persistence

Native open and save dialogs go through the Tauri dialog and fs plugins. The active file path is held at runtime, outside the Model. Capabilities are least-privilege: there is no standing fs scope, and the dialog grants access to exactly the paths the user picks. Closing with unsaved changes asks for confirmation.

## Edge routing

Edges are drawn through the `EdgeRouter` interface (`edgeRouter.ts`), with cubic Bézier by default, so an orthogonal router can replace it without touching views. Edges anchor at card headers. Each card has exactly two header ports, and enum cards have none, so they aren't drop targets.
