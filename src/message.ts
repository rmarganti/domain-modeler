import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { DomainModelDocument, EndIndex, Multiplicity, Primitive } from "./domain/schema";

const PointerFields = {
  button: Schema.Number,
  clientX: Schema.Number,
  clientY: Schema.Number,
};

export const MoveDirection = Schema.Literals(["Up", "Down"]);
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
  PressedEnumHeader: { typeId: Schema.String, ...PointerFields },
  PressedPort: { entityId: Schema.String, ...PointerFields },
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
  ClickedAddEnum: {},
  ChangedDocumentName: { name: Schema.String },

  // Cards
  ClickedToggleExpand: { nodeId: Schema.String },

  // Entities
  DoubleClickedEntityName: { entityId: Schema.String },
  UpdatedEntityDraftName: { name: Schema.String },
  ClickedDeleteEntity: { entityId: Schema.String },

  // Attributes
  ClickedAddAttribute: { entityId: Schema.String },
  ClickedEditAttribute: { entityId: Schema.String, attributeId: Schema.String },
  ClickedDeleteAttribute: { entityId: Schema.String, attributeId: Schema.String },
  ClickedMoveAttribute: {
    entityId: Schema.String,
    attributeId: Schema.String,
    direction: MoveDirection,
  },
  UpdatedAttributeDraftName: { name: Schema.String },
  SelectedAttributeDraftType: { type: Primitive },
  SelectedAttributeDraftMultiplicity: { multiplicity: Multiplicity },
  ToggledAttributeDraftUnique: {},
  UpdatedAttributeDraftLiteralOptions: { text: Schema.String },
  ClickedSaveAttribute: {},
  ClickedCancelEdit: {},

  // Enums
  DoubleClickedEnumName: { typeId: Schema.String },
  UpdatedEnumDraftName: { name: Schema.String },
  ClickedDeleteEnum: { typeId: Schema.String },
  ClickedAddEnumValue: { typeId: Schema.String },
  ClickedEditEnumValue: { typeId: Schema.String, valueId: Schema.String },
  ClickedDeleteEnumValue: { typeId: Schema.String, valueId: Schema.String },
  ClickedMoveEnumValue: {
    typeId: Schema.String,
    valueId: Schema.String,
    direction: MoveDirection,
  },
  UpdatedEnumValueDraftName: { name: Schema.String },
  UpdatedEnumValueDraftDescription: { description: Schema.String },
  ClickedSaveEnumValue: {},

  // Associations
  ClickedEdge: { associationId: Schema.String },
  ChangedAssociationName: { associationId: Schema.String, name: Schema.String },
  ChangedAssociationDescription: { associationId: Schema.String, description: Schema.String },
  SelectedEndMultiplicity: {
    associationId: Schema.String,
    endIndex: EndIndex,
    multiplicity: Multiplicity,
  },
  ChangedEndRole: { associationId: Schema.String, endIndex: EndIndex, role: Schema.String },
  ClickedDeleteAssociation: { associationId: Schema.String },
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
