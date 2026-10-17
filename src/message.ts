import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { Cardinality, DomainModelDocument, PropertyType } from "./domain/schema";

const PointerFields = {
  button: Schema.Number,
  clientX: Schema.Number,
  clientY: Schema.Number,
};

export const MoveDirection = Schema.Literals(["Up", "Down"]);
export const RelationshipEnd = Schema.Literals(["Source", "Target"]);
export const DraftFlag = Schema.Literals(["isId", "isOptional", "isNullable"]);
export type DraftFlag = typeof DraftFlag.Type;
export const WheelIntent = Schema.Literals(["Zoom", "Pan"]);

export const Message = defineMessageUnion({
  // Keyboard
  PressedCreateEntityKey: {},
  PressedDeleteKey: {},
  PressedUndoKey: {},
  PressedRedoKey: {},
  PressedEditKey: {},
  PressedEnterKey: {},
  PressedEscapeKey: {},
  PressedSaveKey: {},
  PressedSaveAsKey: {},
  PressedOpenKey: {},
  PressedSpace: {},
  ReleasedSpace: {},

  // Pointer & canvas
  PressedCanvas: PointerFields,
  PressedNodeHeader: { entityId: Schema.String, ...PointerFields },
  PressedPort: {
    entityId: Schema.String,
    maybePropertyId: Schema.Option(Schema.String),
    ...PointerFields,
  },
  MovedPointer: { clientX: Schema.Number, clientY: Schema.Number },
  ReleasedPointer: {
    clientX: Schema.Number,
    clientY: Schema.Number,
    maybeTargetEntityId: Schema.Option(Schema.String),
  },
  WheeledCanvas: {
    clientX: Schema.Number,
    clientY: Schema.Number,
    deltaX: Schema.Number,
    deltaY: Schema.Number,
    intent: WheelIntent,
  },
  ResizedScreen: { width: Schema.Number, height: Schema.Number },

  // HUD
  ClickedZoomIn: {},
  ClickedZoomOut: {},
  ClickedResetView: {},
  ClickedFitToScreen: {},

  // Toolbar
  ClickedNewDocument: {},
  ClickedOpen: {},
  ClickedSave: {},
  ClickedSaveAs: {},
  ClickedUndo: {},
  ClickedRedo: {},
  ClickedAddEntity: {},
  ChangedDocumentName: { name: Schema.String },

  // Entities
  ClickedToggleExpand: { entityId: Schema.String },
  DoubleClickedEntityName: { entityId: Schema.String },
  UpdatedEntityDraftName: { name: Schema.String },
  ClickedDeleteEntity: { entityId: Schema.String },

  // Properties
  ClickedAddProperty: { entityId: Schema.String },
  ClickedEditProperty: { entityId: Schema.String, propertyId: Schema.String },
  ClickedDeleteProperty: { entityId: Schema.String, propertyId: Schema.String },
  ClickedMoveProperty: {
    entityId: Schema.String,
    propertyId: Schema.String,
    direction: MoveDirection,
  },
  UpdatedPropertyDraftName: { name: Schema.String },
  SelectedPropertyDraftType: { type: PropertyType },
  ToggledPropertyDraftFlag: { flag: DraftFlag },
  UpdatedPropertyDraftLiteralOptions: { text: Schema.String },
  ClickedSaveProperty: {},
  ClickedCancelEdit: {},

  // Relationships
  ClickedEdge: { relationshipId: Schema.String },
  SelectedCardinality: { relationshipId: Schema.String, cardinality: Cardinality },
  ClickedReverseRelationship: { relationshipId: Schema.String },
  SelectedRelationshipProperty: {
    relationshipId: Schema.String,
    end: RelationshipEnd,
    maybePropertyId: Schema.Option(Schema.String),
  },
  ChangedRelationshipName: { relationshipId: Schema.String, name: Schema.String },
  ClickedDeleteRelationship: { relationshipId: Schema.String },
  ClickedCloseInspector: {},

  // Files
  SucceededOpenFile: { document: DomainModelDocument, fileName: Schema.String },
  FailedOpenFile: { error: Schema.String },
  SucceededSaveFile: { fileName: Schema.String },
  FailedSaveFile: { error: Schema.String },
  CancelledFilePicker: {},
  CompletedForgetActiveFile: {},
  CompletedFocusInput: {},
  ClickedDismissNotice: {},

  // Window
  RequestedWindowClose: {},
  CompletedCloseWindow: {},
  CancelledCloseWindow: {},
});
export type Message = typeof Message.Type;
