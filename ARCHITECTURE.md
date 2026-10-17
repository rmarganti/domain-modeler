# Domain Modeler Architecture Document

## 1. Overview & System Vision

The **Domain Modeler** is a browser-based, visual database and domain schema designer. It enables software engineers and architects to interactively design entity-relationship diagrams (ERDs) and domain models with high precision, fluidity, and type-safety.

The application is built on **Foldkit**, a frontend framework embodying **The Elm Architecture (TEA)** on top of **Effect**. The entire domain schema and application state are governed by explicit models, typed message unions, pure update loops, and declarative views.

---

## 2. Generic Domain Model AST

The schema definition format is a **Generic Domain Model AST**: a problem-domain-agnostic meta-model capable of describing arbitrary domains, entities, properties, constraints, and relationships. It is strictly parsed, validated, and serialized using **Effect Schema**.

### 2.1 AST Specification

```ts
import { Schema } from "effect";

export const PropertyType = Schema.Literals([
  "String",
  "Number",
  "Boolean",
  "Date",
  "UUID",
  "Literal",
  "Json",
]);
export type PropertyType = typeof PropertyType.Type;

export const PropertyDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: PropertyType,
  literalOptions: Schema.optional(Schema.Array(Schema.String)),
  isId: Schema.Boolean,
  isOptional: Schema.Boolean,
  isNullable: Schema.Boolean,
  description: Schema.optional(Schema.String),
});
export type PropertyDefinition = typeof PropertyDefinition.Type;

export const EntityDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  properties: Schema.Array(PropertyDefinition),
});
export type EntityDefinition = typeof EntityDefinition.Type;

export const Cardinality = Schema.Literals(["1:1", "1:N", "N:M"]);
export type Cardinality = typeof Cardinality.Type;

export const RelationshipDefinition = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  sourceEntityId: Schema.String,
  targetEntityId: Schema.String,
  sourcePropertyId: Schema.optional(Schema.String),
  targetPropertyId: Schema.optional(Schema.String),
  cardinality: Cardinality,
});
export type RelationshipDefinition = typeof RelationshipDefinition.Type;
```

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
  relationships: Schema.Array(RelationshipDefinition),
  layout: DomainLayout,
});
export type DomainModelDocument = typeof DomainModelDocument.Type;
```

### 3.2 Bi-directional Sync & Invariant Validation

A domain validation pass ensures that:

- Every entity ID has a corresponding entry in `layout.nodes` (missing entries are assigned smart auto-staggered positions).
- No orphan entries exist in `layout.nodes` for deleted entities.
- Relationship source and target IDs exist in `entities`.
- Property references within relationships point to valid fields on the respective entities.

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
- **Expanded (On-Click)**: Smoothly expands in-place into an entity card detailing all properties, types, constraints (`PK`, `NULL`, `OPT`), and inline actions to add, edit, reorder, or delete fields.

### 4.3 Port Drag-and-Drop Connection

- Handles/ports appear on node boundaries (and specific ID/key fields).
- Dragging from an entity port pulls a live dynamic connector line. Releasing onto another entity creates a relationship edge and opens the inspector to configure cardinality and field bindings.

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

- **Default implementation**: Smooth cubic Bézier curves with direction markers and interactive midpoint cardinality tags (`1 ── N`).
- Swappable in the future for orthogonal / Manhattan routing without touching UI components.

### 4.5 Relationship Edge Inspection

- Clicking an edge highlights the curve and displays a floating inspector pill at its midpoint.
- The pill allows changing cardinality (`1:1`, `1:N`, `N:M`), reversing direction, configuring foreign keys, or deleting the edge (`Delete` / `Backspace`).

---

## 5. UI Interaction State Machine

The editor UI strictly avoids boolean flags and is governed by an **Explicit Tagged Union State Machine**:

```ts
export type EditorState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "CreatingEntity"; readonly position: Point }
  | { readonly _tag: "RenamingEntity"; readonly entityId: string }
  | { readonly _tag: "EditingProperty"; readonly entityId: string; readonly propertyId: string }
  | {
      readonly _tag: "ConnectingRelationship";
      readonly sourceEntityId: string;
      readonly currentPos: Point;
    }
  | { readonly _tag: "EditingRelationship"; readonly relationshipId: string }
  | { readonly _tag: "DraggingNode"; readonly entityId: string; readonly offset: Point }
  | { readonly _tag: "PanningCanvas"; readonly startPan: Point; readonly startMouse: Point };
```

### Keybinding & Mode Matrix

| State                                | Keybindings Active                                                                                                                                                                              | Keystrokes        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `Idle` (Normal Mode)                 | `c`: Create entity at center/cursor<br>`d`: Delete selected entity/edge<br>`u`: Undo<br>`Ctrl+r`: Redo<br>`Enter` or `i`: Expand & edit selected entity<br>`Escape`: Deselect / clear selection | Canvas shortcuts  |
| `RenamingEntity` / `EditingProperty` | Input text capture active (`c`, `d` type text)<br>`Enter`: Commit edit and return to `Idle`<br>`Escape`: Cancel edit and return to `Idle`                                                       | Text input focus  |
| `ConnectingRelationship`             | Dragging mouse updates line<br>`Escape`: Cancel connection                                                                                                                                      | Active connection |
| `DraggingNode` / `PanningCanvas`     | Pointer movement updates coordinates<br>Pointer release commits position and returns to `Idle`                                                                                                  | Canvas drag       |

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

- Discrete model mutations (adding/deleting entities, property modifications, completed node drags, edge changes) push `present` onto `past` (capped at 50 snapshots) and clear `future`.
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
- **Duplicate Property Names**: Flagged within the entity property list.
- **Dangling References**: Broken foreign key bindings or orphaned edges flagged with warning badges.
- **Type Mismatches**: Warning displayed on relationship pills when foreign keys have divergent types.

---

## 9. Technology Stack

- **Framework**: Foldkit (`0.168.0`) + `@foldkit/ui`
- **Functional Core**: Effect (`4.0.0`) + `@effect/platform-browser` (`4.0.0`)
- **Bundler**: Vite (`8.3.1`) + `@foldkit/vite-plugin`
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `tailwindcss 4.3.3`)
- **Testing**: Vitest (`5.0.2`) + `happy-dom`
- **Desktop Shell**: Tauri v2 (`@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`)
- **Package Manager**: pnpm
