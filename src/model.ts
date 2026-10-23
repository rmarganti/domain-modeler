import { Equal, Option, Record, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { History } from "./domain/history";
import { IdState } from "./domain/ids";
import { AttributeType, DomainModelDocument, Multiplicity, Point } from "./domain/schema";

// EDITOR STATE MACHINE
// The editor never tracks interaction with boolean flags: exactly one of these
// states is active, and each carries only the data its interaction needs.

export const AttributeDraft = Schema.Struct({
  name: Schema.String,
  type: AttributeType,
  multiplicity: Multiplicity,
  unique: Schema.Boolean,
});
export type AttributeDraft = typeof AttributeDraft.Type;

export const EnumValueDraft = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
});
export type EnumValueDraft = typeof EnumValueDraft.Type;

/** How saving an enum value edit lands in history. `Amend` folds it into the
 *  latest snapshot: the first value of an enum made with "New enum…" is part
 *  of that one undo step. */
export const EnumValueSave = Schema.Literals(["Commit", "Amend"]);
export type EnumValueSave = typeof EnumValueSave.Type;

/** What the "New…" chooser creates, in the order it lists them. */
export const NewKind = Schema.Literals(["Entity", "Enum"]);
export type NewKind = typeof NewKind.Type;

/** What a picker lists and what picking does: focus a card, connect the
 *  source entity to one, or run a command (the command palette). */
export const PickerPurpose = defineTaggedUnion({
  Focus: {},
  Connect: { sourceEntityId: Schema.String },
  RunCommand: {},
});
export type PickerPurpose = typeof PickerPurpose.Type;

export const EditorState = defineTaggedUnion({
  Idle: {},
  ViewingShortcuts: {},
  Picking: { query: Schema.String, highlighted: Schema.Number, purpose: PickerPurpose },
  /** The "New…" chooser is open; picking creates a card at `position`. */
  ChoosingNew: { position: Point, highlighted: NewKind },
  CreatingEntity: { position: Point, draftName: Schema.String },
  RenamingEntity: { entityId: Schema.String, draftName: Schema.String },
  EditingAttribute: {
    entityId: Schema.String,
    attributeId: Schema.String,
    draft: AttributeDraft,
  },
  CreatingEnum: { position: Point, draftName: Schema.String },
  RenamingEnum: { typeId: Schema.String, draftName: Schema.String },
  EditingEnumValue: {
    typeId: Schema.String,
    valueId: Schema.String,
    draft: EnumValueDraft,
    save: EnumValueSave,
  },
  ConnectingAssociation: {
    fromEntityId: Schema.String,
    startPos: Point,
    currentPos: Point,
  },
  EditingAssociation: { associationId: Schema.String },
  /** Dragging any card, entity or enum, by its header. */
  DraggingNode: {
    nodeId: Schema.String,
    offset: Point,
    origin: Point,
    position: Point,
  },
  PanningCanvas: { startPan: Point, startMouse: Point },
});
export type EditorState = typeof EditorState.Type;

export const CardRow = defineTaggedUnion({
  Title: {},
  Attribute: { attributeId: Schema.String },
  Value: { valueId: Schema.String },
});
export type CardRow = typeof CardRow.Type;

export const Selection = defineTaggedUnion({
  NoSelection: {},
  SelectedEntity: { entityId: Schema.String, row: CardRow },
  SelectedEnum: { typeId: Schema.String, row: CardRow },
  SelectedAssociation: { associationId: Schema.String },
});
export type Selection = typeof Selection.Type;

// SUPPORTING STATE

export const ScreenSize = Schema.Struct({
  width: Schema.Number,
  height: Schema.Number,
});
export type ScreenSize = typeof ScreenSize.Type;

export const PanKey = Schema.Literals(["Released", "Held"]);
export type PanKey = typeof PanKey.Type;

export const Notice = Schema.Struct({
  tone: Schema.Literals(["Info", "Error"]),
  text: Schema.String,
});
export type Notice = typeof Notice.Type;

/** Why the open file on disk can't be merged right now. Kept so a problem is
 *  reported once, not on every watch event or focus check while it lasts.
 *  `Diverged`: the file changed but there is no saved document to merge from. */
export const DiskIssue = Schema.Literals(["Invalid", "Missing", "Diverged"]);
export type DiskIssue = typeof DiskIssue.Type;

// MODEL

export const Model = Schema.Struct({
  history: History,
  /** Where the next new ID comes from. Kept outside the document and history,
   *  so undo never rewinds it and an undone ID is never minted again. */
  idState: IdState,
  editor: EditorState,
  selection: Selection,
  screen: ScreenSize,
  panKey: PanKey,
  /** The open file. Subscriptions watch it, and Save writes back to it. */
  maybeFilePath: Schema.Option(Schema.String),
  /** The version there is nothing to lose relative to: the document as last
   *  read from or written to disk. `None` when the content exists nowhere else.
   *  It is also the base for merging external edits to the open file. */
  maybeSavedDocument: Schema.Option(DomainModelDocument),
  /** The latest external edit to the open file (synced), waiting for the
   *  editor to be idle before it's merged. Only the latest is kept. */
  maybePendingDiskDocument: Schema.Option(DomainModelDocument),
  maybeDiskIssue: Schema.Option(DiskIssue),
  maybeNotice: Schema.Option(Notice),
  /** Command palette ids, most recent first. Kept across launches. */
  recentCommandIds: Schema.Array(Schema.String),
});
export type Model = typeof Model.Type;

// DERIVED

export const fileNameOf = (path: string): string => path.split(/[\\/]/).at(-1) ?? path;

export const maybeFileName = (model: Model): Option.Option<string> =>
  Option.map(model.maybeFilePath, fileNameOf);

/** Drops what doesn't count as an unsaved change: pan, zoom, and expansion. */
const withoutTransientLayout = (document: DomainModelDocument) => ({
  ...document,
  layout: {
    nodes: Record.map(document.layout.nodes, ({ position }) => ({ position })),
    viewport: null,
  },
});

/** Whether two documents differ in anything that counts as an unsaved change. */
export const hasSameContent = (a: DomainModelDocument, b: DomainModelDocument): boolean =>
  a === b || Equal.equals(withoutTransientLayout(a), withoutTransientLayout(b));

/** Whether the present document differs from the saved one. */
export const isDirty = (model: Model): boolean =>
  Option.match(model.maybeSavedDocument, {
    onNone: () => true,
    onSome: (saved) => !hasSameContent(saved, model.history.present),
  });
