# Domain Modeler Architecture Document

## 1. Overview & System Vision

The **Domain Modeler** is a browser-based, visual database and domain schema designer. It enables software engineers and architects to interactively design entity-relationship diagrams (ERDs) and domain models with high precision, fluidity, and type-safety.

The application is built on **Foldkit**, a frontend framework embodying **The Elm Architecture (TEA)** on top of **Effect**. The entire domain schema and application state are governed by explicit models, typed message unions, pure update loops, and declarative views.

---

## 2. Generic Domain Model AST

The schema definition format is a **Generic Domain Model AST**: a problem-domain-agnostic meta-model capable of describing arbitrary domains, entities, attributes, constraints, and relationships. It is strictly parsed, validated, and serialized using **Effect Schema**.

### 2.1 AST Specification

```ts
import { Schema } from "effect";

export const Multiplicity = Schema.Struct({
  min: Schema.Literals([0, 1]),
  max: Schema.Literals(["one", "many"]),
});
export type Multiplicity = typeof Multiplicity.Type;

export const Primitive = Schema.Literals([
  "String",
  "Integer",
  "Decimal",
  "Boolean",
  "Date",
  "DateTime",
  "Json",
]);
export type Primitive = typeof Primitive.Type;

export const TypeRef = Schema.Struct({ typeId: Schema.String }); // an entry of `types`
export type TypeRef = typeof TypeRef.Type;

export const AttributeType = Schema.Union([Primitive, TypeRef]);
export type AttributeType = typeof AttributeType.Type;

export const AttributeDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  type: AttributeType,
  multiplicity: Multiplicity,
  unique: Schema.Boolean,
});
export type AttributeDefinition = typeof AttributeDefinition.Type;

export const EntityDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  attributes: Schema.Array(AttributeDefinition),
});
export type EntityDefinition = typeof EntityDefinition.Type;

export const EnumValue = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
});
export type EnumValue = typeof EnumValue.Type;

export const EnumDefinition = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("Enum"), // discriminator: value objects may join a union later
  name: Schema.String,
  description: Schema.optional(Schema.String),
  values: Schema.Array(EnumValue),
});
export type EnumDefinition = typeof EnumDefinition.Type;

export const AssociationEnd = Schema.Struct({
  entityId: Schema.String,
  role: Schema.optional(Schema.String),
  multiplicity: Multiplicity,
});
export type AssociationEnd = typeof AssociationEnd.Type;

export const EndIndex = Schema.Literals([0, 1]);
export type EndIndex = typeof EndIndex.Type;

export const AssociationDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String), // verb label, display only
  description: Schema.optional(Schema.String),
  ends: Schema.Tuple([AssociationEnd, AssociationEnd]),
});
export type AssociationDefinition = typeof AssociationDefinition.Type;
```

Entity identity is implicit: every entity is distinguishable without an ID attribute, so there is no primary key flag; business keys are expressed with `unique`. An association connects two entities and nothing else; it never references individual attributes. Foreign keys and join tables are a concern of future exporters, which can derive them from the association's ends.

Enums live in the document's top-level `types` collection. An enum is only its `types` entry plus its `layout.nodes` card, and the only thing that points at it is an attribute typed `{ typeId }`; that keeps enums movable to a separate view later. `isTypeRef` (`schema.ts`) tells a reference from a primitive, and `attributeTypeLabel` (`document.ts`) reads a type as the primitive's name, the enum's name, or `?` for a dangling reference. Deleting an enum does not retype the attributes that use it: they dangle, a diagnostic reports it (§8), and undo is the way back. `unique` is allowed on an enum-typed attribute. Entity and enum names share one namespace (see §8). IDs are derived from the document with one prefix per kind: `e` entities, `p` attributes, `t` types, `v` enum values, `r` associations.

The code and the file format say "association" and "attribute"; everything the user sees says "Relationship" and "field".

An attribute's `multiplicity` uses the same shape and the same ordered labels (`1`, `0..1`, `0..*`, `1..*`) as an association end; `0..1` is an optional value and a `many` maximum is a list. A list can't be `unique`: the document API forces `unique` to `false` whenever an attribute's `max` is `"many"`, and the field editor disables the Unique checkbox for list multiplicities. A new attribute is a `String` with multiplicity `1` and `unique: false`.

### 2.2 Associations

An association has two ends and no direction: both ends are always navigable, and `name` is only a verb label for display ("User _writes_ Post"). `ends[0]` is the entity the user dragged from.

- **Multiplicity** uses the UML reading: the multiplicity on `ends[i]` answers "how many of `ends[i]`'s entity per one of the other entity". `User 1 ── 0..* Post` means a User has zero or more Posts and a Post has exactly one User. The four allowed values are listed, in order, by `MULTIPLICITIES` in `src/domain/multiplicity.ts`: `1` = `{1, one}`, `0..1` = `{0, one}`, `0..*` = `{0, many}`, `1..*` = `{1, many}`. Attributes reuse the same list.
- **Roles**: the role on `ends[i]` is the name the other entity uses to reach `ends[i]`'s entity (the role on the Post end of `writes` is `user.posts`). A missing or blank role gets a default, derived on demand and never stored: the entity name in camelCase, pluralized with the `pluralize` package when `max` is `"many"` (`Line Item` at `0..*` → `lineItems`). `src/domain/naming.ts` owns this and is the only module that imports `pluralize`.
- New associations start as `ends[0]` at `1` and `ends[1]` at `0..*`.

---

## 3. Separation of Domain Semantics and Layout

Layout and visual presentation metadata are completely decoupled from domain entities and stored in a dedicated `layout` section. This preserves clean schema semantics for external consumers while enabling exact canvas viewport and coordinate restoration.

### 3.1 Document Schema

```ts
export const Point = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
});
export type Point = typeof Point.Type;

export const NodeLayout = Schema.Struct({
  position: Point,
  isExpanded: Schema.Boolean,
});
export type NodeLayout = typeof NodeLayout.Type;

export const ViewportLayout = Schema.Struct({
  pan: Point,
  zoom: Schema.Number,
});
export type ViewportLayout = typeof ViewportLayout.Type;

export const DomainLayout = Schema.Struct({
  nodes: Schema.Record({ key: Schema.String, value: NodeLayout }), // keyed by entity or type ID
  viewport: ViewportLayout,
});
export type DomainLayout = typeof DomainLayout.Type;

export const DomainModelDocument = Schema.Struct({
  version: Schema.Literal("1.0.0"),
  name: Schema.String,
  entities: Schema.Array(EntityDefinition),
  types: Schema.Array(EnumDefinition),
  associations: Schema.Array(AssociationDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;
```

`layout.nodes` is one record for every card on the canvas, keyed by entity ID or type ID.

### 3.2 Bi-directional Sync & Invariant Validation

A domain validation pass ensures that:

- Every entity ID and type ID has a corresponding entry in `layout.nodes` (missing entries are assigned smart auto-staggered positions).
- No orphan entries exist in `layout.nodes` for deleted entities or types.
- Both association end entity IDs exist in `entities`.

---

## 4. Canvas Architecture & Visual Interactions

### 4.1 Infinite Pan & Zoom

- Infinite dot-grid canvas with smooth panning and zooming.
- Controls:
  - Middle-click drag, trackpad pan, or Spacebar + drag pans the canvas.
  - Mouse wheel or pinch zooms centered around the cursor position.
  - Floating HUD displays zoom percentage with quick "Reset View" (100%) and "Fit to Screen" buttons.

### 4.2 Entity Nodes & Inline Expansion

- **Collapsed (Default)**: Compact badge displaying entity name, field count badge, and handle ports.
- **Expanded (On-Click)**: Smoothly expands in-place into an entity card detailing all fields: name, type, a multiplicity badge when it isn't `1` (`0..1`, `0..*`, `1..*`), a `UQ` badge when unique, and inline actions to add, edit, reorder, or delete fields.

### 4.3 Enum Cards

- Enum cards share the entity card's chrome (`src/view/card.ts`) and dimensions: collapsed they are the same size as a collapsed entity, and expanded each value is one row (`cardShape` in `src/domain/geometry.ts` sizes both kinds). New cards of either kind are placed clear of every existing card.
- The header shows the name (double-click to rename), an `enum` badge, the value count, and `Expand`/`Collapse`. Expanded rows show the value name in mono and its description in muted text, with `Move up`, `Move down`, `Edit value`, and `Delete value` on hover. Clicking a row selects it; Enter, `i`, or `Edit value` opens its inline editor (`Value name`, `Value description`). Enter saves and Escape cancels, keeping that row current. A blank description removes it.
- The footer has `+ Add value` and `Delete <Name>`. The toolbar's `+ Enum` button (aria-label `Create enum`) starts naming a new enum at the viewport center.
- Enum cards have no ports and carry `data-type-id`, never `data-entity-id`, so they are not relationship drop targets: releasing a connection over one cancels it, as on empty canvas.
- Enum cards are dragged by the header and selected like entity cards; every change is undoable.
- **Field typing.** The field editor's `Field type` select groups its options: `Primitives`, then `Enums` (every enum by name, option value `type:<id>`; left out when there are none), then `New enum…`. A field whose enum no longer exists shows a disabled, selected `?`. On an expanded entity, an enum-typed field shows the enum's name as a link-like button (`Go to enum <Name>`) that selects the enum card without moving the camera; the button stays put on hover (the row reserves room for its actions), and a dangling type reads `?` with a warning.
- **New enum….** Choosing it is one undo step: `addEnumForAttribute` creates an enum named after the field (PascalCase via `naming.ts`'s `enumNameForAttribute`, `NewEnum` when blank) with one blank value, places it expanded to the right of the entity card, and saves the field's draft typed `{ typeId }`. The editor moves to `EditingEnumValue` on that value with `save: "Amend"`, so naming the value folds into the same snapshot: one `u` removes the enum and restores the field. Escape leaves the blank value in place as an empty row; no diagnostic flags a blank value name yet.
- **Used-by highlight.** While an enum card is selected, the rows of fields typed by it get a highlight and the attribute `data-uses-selected-type`. There are no connector lines.

### 4.4 Port Drag-and-Drop Connection

- Every card has exactly two ports, on the left and right of its header, whether collapsed or expanded. Field rows have no ports.
- Dragging from an entity port pulls a live dynamic connector line from the header. Releasing onto another entity creates a relationship edge (`1 ── 0..*`, from the dragged entity to the drop target) and opens the inspector to configure it.
- Edges always anchor at the card header.

### 4.5 Pluggable Edge Routing

Relationship edges are rendered via an abstract routing interface:

```ts
export interface EdgeRouter {
  computePath(
    source: Point,
    target: Point,
    sourceSide: "left" | "right",
    targetSide: "left" | "right",
  ): string;
  computeMidpoint(source: Point, target: Point): Point;
}
```

- **Default implementation**: Smooth cubic Bézier curves with end markers and interactive midpoint multiplicity tags reading `<ends[0]> ── <ends[1]>` (for example `1 ── 0..*`).
- Swappable in the future for orthogonal / Manhattan routing without touching UI components.

### 4.6 Relationship Edge Inspection

- Clicking an edge highlights the curve and displays a floating inspector pill at its midpoint.
- The pill edits the verb label (`Relationship name`) and a description, and has one section per end, headed with that end's entity name: a role textbox whose faded placeholder is the derived default role, and a multiplicity radiogroup (`1`, `0..1`, `0..*`, `1..*`). For a self association the end labels carry `(end 1)` / `(end 2)`.
- `Delete` / `Backspace` or the trash button deletes the edge. There is no reverse button: without direction, reversing means nothing.

---

## 5. UI Interaction State Machine

The editor UI strictly avoids boolean flags and is governed by an **Explicit Tagged Union State Machine**:

```ts
export type EditorState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "ViewingShortcuts" }
  | {
      readonly _tag: "ChoosingNew";
      readonly position: Point;
      readonly highlighted: "Entity" | "Enum";
    }
  | { readonly _tag: "CreatingEntity"; readonly position: Point }
  | { readonly _tag: "RenamingEntity"; readonly entityId: string }
  | { readonly _tag: "EditingAttribute"; readonly entityId: string; readonly attributeId: string }
  | { readonly _tag: "CreatingEnum"; readonly position: Point; readonly draftName: string }
  | { readonly _tag: "RenamingEnum"; readonly typeId: string; readonly draftName: string }
  | {
      readonly _tag: "EditingEnumValue";
      readonly typeId: string;
      readonly valueId: string;
      readonly draft: { name: string; description: string };
      readonly save: "Commit" | "Amend"; // Amend: the first value of a "New enum…"
    }
  | {
      readonly _tag: "ConnectingAssociation";
      readonly fromEntityId: string;
      readonly currentPos: Point;
    }
  | { readonly _tag: "EditingAssociation"; readonly associationId: string }
  | { readonly _tag: "DraggingNode"; readonly nodeId: string; readonly offset: Point } // any card
  | { readonly _tag: "PanningCanvas"; readonly startPan: Point; readonly startMouse: Point };
```

### Keybinding & Mode Matrix

`src/keymap.ts` is the single source of truth for keyboard bindings: each entry owns its keys (including alternatives and sequences), message mapping, description, group, modes, and typing policy. An optional `displayKeys` names the familiar physical shortcut when runtime aliases must match produced characters. `subscription.ts` selects the active mode and builds its Foldkit table with `bindingsFor`; Space-to-pan is in the same registry. Key releases still clear Space independently. Add future shortcuts here, not in another subscription or view.

`formatKeys` formats alternatives and sequences for display. Platform detection runs once against `navigator.userAgent`, with the same Apple pattern Foldkit uses for `Mod`. Toolbar and HUD titles, status hints, and the help dialog read the registry, so they follow the active platform rather than hard-coding Command symbols. HUD actions without a binding show only their label.

| State                                                                                                           | Keybindings Active                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keystrokes         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `Idle` / `EditingAssociation` (Normal Mode)                                                                     | `c`: Open the Entity/Enum chooser<br>`d` / `Delete` / `Backspace`: Delete current row (title deletes card), or edge<br>`u`: Undo<br>`Ctrl+r`: Redo<br>`j` / `ArrowDown`, `k` / `ArrowUp`: Next/previous row (stop at ends)<br>`g g`: Title<br>`Shift+G`: Last row<br>`Enter` or `i`: Edit current row (title renames; expands first)<br>`o` / `Shift+O`: Add row below/above (first on title; expands and edits)<br>`Shift+J` / `Shift+K`: Reorder current field/value down/up<br>`Escape`: Deselect / close inspector<br>`?`: Keyboard shortcuts<br>`Mod+=` / `Mod+Plus`, `Mod+-`: Zoom in/out<br>`Mod+0`: 100%<br>`Shift+1`: Fit all cards<br>`Shift+2`: Zoom to selection | Canvas shortcuts   |
| `ViewingShortcuts` (Help Mode)                                                                                  | `Escape` or `?`: Close, keeping selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Shortcut reference |
| `ChoosingNew` (Choosing Mode)                                                                                   | `ArrowDown` / `ArrowUp`: Move highlight, wrapping<br>`1`: Pick Entity<br>`2`: Pick Enum<br>`Enter`: Pick highlighted option<br>`Escape`: Cancel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | New card chooser   |
| `CreatingEntity` / `RenamingEntity` / `EditingAttribute` / `CreatingEnum` / `RenamingEnum` / `EditingEnumValue` | Input text capture active (`c`, `d` type text)<br>`Mod+=` / `Mod+Plus`, `Mod+-`, `Mod+0`: Zoom / reset<br>`Enter`: Commit edit and return to `Idle`<br>`Escape`: Cancel edit and return to `Idle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Text input focus   |
| `ConnectingAssociation`                                                                                         | Dragging mouse updates line<br>`Escape`: Cancel connection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Active connection  |
| `DraggingNode` / `PanningCanvas`                                                                                | Pointer movement updates coordinates<br>Pointer release commits position and returns to `Idle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Canvas drag        |

File bindings are active in Normal, Text, and Choosing modes, including while typing: `Mod+N` creates a new document, `Mod+O` opens, `Mod+S` saves, and `Mod+Shift+S` saves as. `Mod` is Command on macOS and Control elsewhere. `Mod+N` uses the same action as the toolbar's `New model` button, including its existing unsaved-changes behavior; it is not a chooser shortcut.

View bindings use the same messages as the HUD: `Mod+=` / `Mod+Plus` zoom in, `Mod+-` zooms out around the viewport center, and `Mod+0` resets to 100% around that center. These bindings allow typing in Normal and Text modes, preventing the webview's own zoom. `Shift+1` fits all entity and enum cards, retaining the HUD's 100% cap. `Shift+2` fits the selected entity/enum or both ends of the selected relationship; it does nothing without a valid selection. Both fit actions share bounds math and 80px padding; selection fitting may enlarge up to the global 400% maximum. None adds history or commits an active draft. Fit keys are Normal-only and suppressed in text inputs, where `!` / `@` type normally. Foldkit matches `event.key` and Shift exactly: the registry accepts `Shift+1` / `Shift+!`, `Shift+2` / `Shift+@`, and both unshifted and shifted `Mod+Plus`, while display labels hide layout aliases. Tauri's `zoomHotkeysEnabled` is absent (default false), and its default macOS menu has no zoom accelerators.

`c` opens a screen-centered listbox (`Create new`) with Entity highlighted first. The `ChoosingNew` state captures the new card's canvas position at the viewport center. Picking an option, by key or click, enters `CreatingEntity` or `CreatingEnum` at that position. Clicking outside or pressing Escape cancels without changing the document or history. `c` still types normally in text inputs. The toolbar's `+ Entity` and `+ Enum` buttons start creation directly; their titles advertise `(c)`, and `New model` advertises the platform-specific `Mod+N` shortcut.

`?` in Normal mode or the toolbar's `Keyboard shortcuts` button opens `ViewingShortcuts`: a scrollable dialog (`Keyboard shortcuts`) with a section per key mode and bindings grouped by purpose. Escape, `?`, the close button, or an outside click returns to Idle without changing selection, document, or history. The dialog takes focus and makes the background inert; Help mode only accepts its close bindings. Opening via the toolbar abandons any unfinished text draft without committing it. Literal and shifted `?` events are both registered because Foldkit matches Shift exactly, but `formatKeys` displays them once. `?` in a text input types normally.

A status bar in the bottom toolbar displays the active state pill (e.g. `NORMAL`, `NEW`, `CREATING`, `EDITING`, `CONNECTING`). `ViewingShortcuts` shows `HELP`; `ChoosingNew` shows `NEW`; `CreatingEnum` shows `CREATING`; `RenamingEnum` and `EditingEnumValue` show `EDITING`.

Selection is a separate tagged union: `NoSelection`, `SelectedEntity { entityId, row }`, `SelectedEnum { typeId, row }`, `SelectedAssociation { associationId }`. `CardRow` is `Title | Attribute { attributeId } | Value { valueId }`; IDs keep the cursor stable across reordering. Entity selections use Title/Attribute; enum selections use Title/Value. `reconcile` falls back to Title for a missing or wrong-kind row and clears selection for a missing card. Both document mutation helpers and history restoration reconcile selection.

Pressing a card's header selects Title; clicking a field/value selects that row without editing. The current title or `li` carries `aria-current="true"` and a persistent highlight distinct from hover. `src/update/rows.ts` shares row motion, row-aware editing and deletion across both card kinds. `j` on a collapsed card expands it and selects the first row; `k` on Title stays put. Motion and selection add no history. Enter/`i` edit the current row, expanding first; commit and cancel keep the same cursor. `d`/Delete/Backspace on a field/value deletes just that row in one history entry, choosing the next row, or previous when last, or Title when empty. On Title it deletes the card; relationship deletion is unchanged. Escape in Normal mode clears selection.

`o` / `O` insert a field/value below/above the current row; either inserts first on Title, including on an empty card. The card expands and the new row becomes current with its name input focused. These use the same creation and editing flow as `+ Add field` / `+ Add value`: insertion creates a default `fieldN` / `valueN` in one history entry; Escape keeps that row and discards only its draft, and saving a changed draft adds a separate entry. The document add functions accept an optional insertion index; omitting it retains footer append behavior. `J` / `K` share the move-button handlers and move the current field/value down/up in one history entry, keeping its ID current. Title and out-of-range moves change nothing, preserve the redo branch, and add no history. Reordering never changes expansion. All four verbs are Normal-only, in the registry's Edit group; while editing they type normally.

---

## 6. Undo / Redo Architecture: State Snapshot Zipper

To ensure 100% deterministic, side-effect-free undo and redo in Foldkit's Elm Architecture:

```ts
export const History = Schema.Struct({
  past: Schema.Array(DomainModelDocument),
  present: DomainModelDocument,
  future: Schema.Array(DomainModelDocument),
});
export type History = typeof History.Type;
```

- Discrete model mutations (adding/deleting entities, attribute modifications, completed node drags, edge changes) push `present` onto `past` (capped at 50 snapshots) and clear `future`.
- Transient interactions (in-progress mouse moves during dragging or pan/zoom) only update the active canvas coordinates without pushing history snapshots.
- `u` / `Cmd+Z` pops from `past` into `present`.
- `Ctrl+r` / `Cmd+Shift+Z` pops from `future` into `present`.

---

## 7. File Persistence (Tauri)

The editor ships as a standalone desktop app built with **Tauri v2**, so file access works the same on every platform and does not depend on browser support for the File System Access API.

- "Open" uses the dialog plugin's native `open({ filters: [{ name: 'Domain Model JSON', extensions: ['json'] }] })`, then reads the file with the fs plugin's `readTextFile`.
- "Save As" uses the native `save({ defaultPath: '<name>.domain.json', filters })`, then writes with `writeTextFile`.
- The active file's path is retained in runtime memory, outside the Model.
- Subsequent "Save" operations (`Cmd/Ctrl+S`) write directly to the active path without a dialog.
- Capabilities are least-privilege: the app holds no standing filesystem scope. The dialog plugin grants the fs plugin access to exactly the paths the user picks, for the lifetime of the process.
- Closing the window with unsaved changes asks for confirmation before discarding them.

---

## 8. Non-Blocking Inline Diagnostics

Live schema validation runs in the background on every model update and reports non-blocking diagnostics:

- **Duplicate Type Names** (`DuplicateTypeName { nodeId, name }`): entity and enum names share one namespace, compared case-insensitively. Every card with a clashing name, entity or enum, gets a warning badge ("Duplicate type name “…”").
- **Duplicate Enum Value Names** (`DuplicateEnumValueName { typeId, valueId, name }`): flagged on the value row and the enum card ("Duplicate value name “…”").
- **Empty Enums** (`EmptyEnum { typeId }`): an enum with no values is flagged on its card ("Enum has no values").
- **Duplicate Attribute Names** (`DuplicateAttributeName`): flagged on the field row ("Duplicate field name “…”").
- **Dangling Type References** (`DanglingTypeReference { entityId, attributeId, typeId }`): a field typed by an enum that no longer exists, as after deleting the enum, is flagged on its field row and entity card ("Enum “…” does not exist").
- **Unique Lists** (`UniqueOnList`): a loaded file with an attribute that is both `unique` and `max: "many"` is flagged on its field row ("A list field can't be unique"). The editor can't produce this combination.
- **Dangling References** (`DanglingEntityReference`): an edge whose end entity no longer exists is flagged with a warning badge ("Entity “…” at end 1 does not exist").
- **Role Clashes** (`RoleClash`): for each entity, its attribute names and the effective role of the far end of every association touching it (both roles for a self association) must be unique, case-insensitively. Every association end whose role collides is flagged on its edge ("Role “posts” clashes on User"); giving the end an explicit role clears it.

---

## 9. Technology Stack

- **Framework**: Foldkit (`0.168.0`) + `@foldkit/ui`
- **Functional Core**: Effect (`4.0.0`) + `@effect/platform-browser` (`4.0.0`)
- **Bundler**: Vite (`8.3.1`) + `@foldkit/vite-plugin`
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `tailwindcss 4.3.3`)
- **Testing**: Vitest (`5.0.2`) + `happy-dom`
- **Desktop Shell**: Tauri v2 (`@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`)
- **Package Manager**: pnpm
