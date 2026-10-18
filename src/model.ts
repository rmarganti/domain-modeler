import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { History } from "./domain/history";
import { AttributeType, Multiplicity, Point } from "./domain/schema";

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

export const PickerPurpose = defineTaggedUnion({
  Focus: {},
  Connect: { sourceEntityId: Schema.String },
});
export type PickerPurpose = typeof PickerPurpose.Type;

export const EditorState = defineTaggedUnion({
  Idle: {},
  ViewingShortcuts: {},
  PickingCard: { query: Schema.String, highlighted: Schema.Number, purpose: PickerPurpose },
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

export const SaveStatus = Schema.Literals(["Clean", "Dirty"]);
export type SaveStatus = typeof SaveStatus.Type;

export const Notice = Schema.Struct({
  tone: Schema.Literals(["Info", "Error"]),
  text: Schema.String,
});
export type Notice = typeof Notice.Type;

// MODEL

export const Model = Schema.Struct({
  history: History,
  editor: EditorState,
  selection: Selection,
  screen: ScreenSize,
  panKey: PanKey,
  maybeFileName: Schema.Option(Schema.String),
  saveStatus: SaveStatus,
  maybeNotice: Schema.Option(Notice),
});
export type Model = typeof Model.Type;
