import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { AttributeType, DomainModelDocument, EndIndex, Multiplicity } from "./domain/schema";
import { NewKind } from "./model";
import { SpatialDirection } from "./domain/geometry";

const PointerFields = {
  button: Schema.Number,
  clientX: Schema.Number,
  clientY: Schema.Number,
};

export const MoveDirection = Schema.Literals(["Up", "Down"]);
export const WheelIntent = Schema.Literals(["Zoom", "Pan"]);

export const Message = defineMessageUnion({
  // Keyboard
  PressedNewKey: {},
  PressedFindCardKey: {},
  PressedConnectKey: {},
  PressedShortcutsKey: {},
  PressedZoomToSelectionKey: {},
  PressedDeleteKey: {},
  PressedEditKey: {},
  NavigatedCard: { direction: SpatialDirection },
  MovedCardRow: { motion: Schema.Literals(["Next", "Previous", "First", "Last"]) },
  InsertedCardRow: { position: Schema.Literals(["Above", "Below"]) },
  ReorderedCardRow: { direction: MoveDirection },
  PressedToggleExpandKey: {},
  PressedEnterKey: {},
  PressedEscapeKey: {},
  PressedSpace: {},
  ReleasedSpace: {},

  // New… chooser
  MovedChooserHighlight: { direction: MoveDirection },
  PickedNew: { kind: NewKind },

  // Card picker
  UpdatedCardQuery: { query: Schema.String },
  MovedCardHighlight: { direction: MoveDirection },
  PickedCard: { nodeId: Schema.String },
  CompletedRevealCardOption: {},

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

  // Shared by a key and a control (see ARCHITECTURE.md)
  RequestedNewDocument: {},
  RequestedOpen: {},
  RequestedSave: {},
  RequestedSaveAs: {},
  RequestedUndo: {},
  RequestedRedo: {},
  RequestedZoomIn: {},
  RequestedZoomOut: {},
  RequestedResetView: {},
  RequestedFitToScreen: {},

  // Toolbar
  ClickedShowShortcuts: {},
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
  ClickedAttributeRow: { entityId: Schema.String, attributeId: Schema.String },
  ClickedEditAttribute: { entityId: Schema.String, attributeId: Schema.String },
  ClickedDeleteAttribute: { entityId: Schema.String, attributeId: Schema.String },
  ClickedMoveAttribute: {
    entityId: Schema.String,
    attributeId: Schema.String,
    direction: MoveDirection,
  },
  UpdatedAttributeDraftName: { name: Schema.String },
  SelectedAttributeDraftType: { type: AttributeType },
  SelectedAttributeDraftNewEnum: {},
  SelectedAttributeDraftMultiplicity: { multiplicity: Multiplicity },
  ToggledAttributeDraftUnique: {},
  ClickedSaveAttribute: {},
  ClickedCancelEdit: {},

  // Enums
  ClickedGoToEnum: { typeId: Schema.String },
  DoubleClickedEnumName: { typeId: Schema.String },
  UpdatedEnumDraftName: { name: Schema.String },
  ClickedDeleteEnum: { typeId: Schema.String },
  ClickedAddEnumValue: { typeId: Schema.String },
  ClickedEnumValueRow: { typeId: Schema.String, valueId: Schema.String },
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
  SucceededSaveFile: { document: DomainModelDocument, fileName: Schema.String },
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
