import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { History } from "./domain/history";
import { Point, PropertyType } from "./domain/schema";

// EDITOR STATE MACHINE
// The editor never tracks interaction with boolean flags: exactly one of these
// states is active, and each carries only the data its interaction needs.

export const PropertyDraft = Schema.Struct({
  name: Schema.String,
  type: PropertyType,
  literalOptions: Schema.String,
  isId: Schema.Boolean,
  isOptional: Schema.Boolean,
  isNullable: Schema.Boolean,
});
export type PropertyDraft = typeof PropertyDraft.Type;

export const EditorState = defineTaggedUnion({
  Idle: {},
  CreatingEntity: { position: Point, draftName: Schema.String },
  RenamingEntity: { entityId: Schema.String, draftName: Schema.String },
  EditingProperty: {
    entityId: Schema.String,
    propertyId: Schema.String,
    draft: PropertyDraft,
  },
  ConnectingRelationship: {
    sourceEntityId: Schema.String,
    maybeSourcePropertyId: Schema.Option(Schema.String),
    startPos: Point,
    currentPos: Point,
  },
  EditingRelationship: { relationshipId: Schema.String },
  DraggingNode: {
    entityId: Schema.String,
    offset: Point,
    origin: Point,
    position: Point,
  },
  PanningCanvas: { startPan: Point, startMouse: Point },
});
export type EditorState = typeof EditorState.Type;

export const Selection = defineTaggedUnion({
  NoSelection: {},
  SelectedEntity: { entityId: Schema.String },
  SelectedRelationship: { relationshipId: Schema.String },
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
