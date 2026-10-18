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
  "Literal", // temporary: replaced by enums
]);
export type Primitive = typeof Primitive.Type;

export const AttributeDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  type: Primitive,
  literalOptions: Schema.optional(Schema.Array(Schema.String)), // temporary: replaced by enums
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
  nodes: Schema.Record({ key: Schema.String, value: NodeLayout }),
  viewport: ViewportLayout,
});
export type DomainLayout = typeof DomainLayout.Type;

export const DomainModelDocument = Schema.Struct({
  version: Schema.Literal("1.0.0"),
  name: Schema.String,
  entities: Schema.Array(EntityDefinition),
  associations: Schema.Array(AssociationDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;
```

### 3.2 Bi-directional Sync & Invariant Validation

A domain validation pass ensures that:

- Every entity ID has a corresponding entry in `layout.nodes` (missing entries are assigned smart auto-staggered positions).
- No orphan entries exist in `layout.nodes` for deleted entities.
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

### 4.3 Port Drag-and-Drop Connection

- Every card has exactly two ports, on the left and right of its header, whether collapsed or expanded. Field rows have no ports.
- Dragging from an entity port pulls a live dynamic connector line from the header. Releasing onto another entity creates a relationship edge (`1 ── 0..*`, from the dragged entity to the drop target) and opens the inspector to configure it.
- Edges always anchor at the card header.

### 4.4 Pluggable Edge Routing

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

### 4.5 Relationship Edge Inspection

- Clicking an edge highlights the curve and displays a floating inspector pill at its midpoint.
- The pill edits the verb label (`Relationship name`) and a description, and has one section per end, headed with that end's entity name: a role textbox whose faded placeholder is the derived default role, and a multiplicity radiogroup (`1`, `0..1`, `0..*`, `1..*`). For a self association the end labels carry `(end 1)` / `(end 2)`.
- `Delete` / `Backspace` or the trash button deletes the edge. There is no reverse button: without direction, reversing means nothing.

---

## 5. UI Interaction State Machine

The editor UI strictly avoids boolean flags and is governed by an **Explicit Tagged Union State Machine**:

```ts
export type EditorState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "CreatingEntity"; readonly position: Point }
  | { readonly _tag: "RenamingEntity"; readonly entityId: string }
  | { readonly _tag: "EditingAttribute"; readonly entityId: string; readonly attributeId: string }
  | {
      readonly _tag: "ConnectingAssociation";
      readonly fromEntityId: string;
      readonly currentPos: Point;
    }
  | { readonly _tag: "EditingAssociation"; readonly associationId: string }
  | { readonly _tag: "DraggingNode"; readonly entityId: string; readonly offset: Point }
  | { readonly _tag: "PanningCanvas"; readonly startPan: Point; readonly startMouse: Point };
```

### Keybinding & Mode Matrix

| State                                 | Keybindings Active                                                                                                                                                                              | Keystrokes        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `Idle` (Normal Mode)                  | `c`: Create entity at center/cursor<br>`d`: Delete selected entity/edge<br>`u`: Undo<br>`Ctrl+r`: Redo<br>`Enter` or `i`: Expand & edit selected entity<br>`Escape`: Deselect / clear selection | Canvas shortcuts  |
| `RenamingEntity` / `EditingAttribute` | Input text capture active (`c`, `d` type text)<br>`Enter`: Commit edit and return to `Idle`<br>`Escape`: Cancel edit and return to `Idle`                                                       | Text input focus  |
| `ConnectingAssociation`               | Dragging mouse updates line<br>`Escape`: Cancel connection                                                                                                                                      | Active connection |
| `DraggingNode` / `PanningCanvas`      | Pointer movement updates coordinates<br>Pointer release commits position and returns to `Idle`                                                                                                  | Canvas drag       |

A status bar in the bottom toolbar displays the active state pill (e.g. `NORMAL`, `CREATING`, `EDITING`, `CONNECTING`).

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

- **Duplicate Entity Names**: Highlighted with warning badges on affected cards.
- **Duplicate Attribute Names** (`DuplicateAttributeName`): flagged on the field row ("Duplicate field name “…”").
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
