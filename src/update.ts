import { Option } from "effect";

import * as Doc from "./domain/document";
import { ZOOM_STEP } from "./domain/geometry";
import { Message } from "./message";
import { Selection, type Model } from "./model";
import * as Canvas from "./update/canvas";
import {
  cancelEditing,
  finishEditing,
  selectDraftMultiplicity,
  toggleDraftUnique,
  updateAttributeDraft,
  updateEnumValueDraft,
} from "./update/editing";
import * as Entities from "./update/entities";
import * as Enums from "./update/enums";
import * as Associations from "./update/associations";
import * as Session from "./update/session";
import {
  commitDocument,
  deselect,
  toIdle,
  toggleExpanded,
  type UpdateReturn,
} from "./update/shared";

// Every Message is handled here, so exhaustiveness is checked in one place.
// Handlers with any logic live in the area modules under ./update/.

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    // Keyboard

    PressedCreateEntityKey: () => Entities.startCreating(model),
    PressedDeleteKey: () => ({ model: Session.deleteSelection(model) }),
    PressedUndoKey: () => ({ model: Session.undo(model) }),
    PressedRedoKey: () => ({ model: Session.redo(model) }),
    PressedEditKey: () => Entities.editSelection(model),
    PressedEnterKey: () =>
      model.editor._tag === "Idle"
        ? Entities.editSelection(model)
        : { model: finishEditing(model) },
    PressedEscapeKey: () => ({ model: cancelEditing(model) }),
    PressedSaveKey: () => Session.save(model),
    PressedSaveAsKey: () => Session.saveAs(model),
    PressedOpenKey: () => Session.open(model),
    PressedSpace: () => ({ model: { ...model, panKey: "Held" } }),
    ReleasedSpace: () => ({ model: { ...model, panKey: "Released" } }),

    // Pointer & canvas

    PressedCanvas: (press) => Canvas.pressCanvas(model, press),
    PressedNodeHeader: ({ entityId, ...press }) => Canvas.pressNodeHeader(model, entityId, press),
    PressedEnumHeader: ({ typeId, ...press }) => Canvas.pressEnumHeader(model, typeId, press),
    PressedPort: ({ entityId, ...press }) => Canvas.pressPort(model, entityId, press),
    MovedPointer: ({ clientX, clientY }) => Canvas.movePointer(model, clientX, clientY),
    ReleasedPointer: ({ clientX, clientY, maybeTargetEntityId }) =>
      Canvas.releasePointer(model, clientX, clientY, maybeTargetEntityId),
    WheeledCanvas: (wheelEvent) => ({ model: Canvas.wheel(model, wheelEvent) }),
    ResizedScreen: ({ width, height }) => ({ model: { ...model, screen: { width, height } } }),

    // HUD

    ClickedZoomIn: () => ({ model: Canvas.zoomBy(model, ZOOM_STEP) }),
    ClickedZoomOut: () => ({ model: Canvas.zoomBy(model, 1 / ZOOM_STEP) }),
    ClickedResetView: () => ({ model: Canvas.resetView(model) }),
    ClickedFitToScreen: () => ({ model: Canvas.fitToScreen(model) }),

    // Toolbar

    ClickedNewDocument: () => Session.newDocument(model),
    ClickedOpen: () => Session.open(model),
    ClickedSave: () => Session.save(model),
    ClickedSaveAs: () => Session.saveAs(model),
    ClickedUndo: () => ({ model: Session.undo(model) }),
    ClickedRedo: () => ({ model: Session.redo(model) }),
    ClickedAddEntity: () => Entities.startCreating(model),
    ClickedAddEnum: () => Enums.startCreating(model),
    ChangedDocumentName: ({ name }) => ({ model: Session.renameDocument(model, name) }),

    // Cards

    ClickedToggleExpand: ({ nodeId }) => ({ model: toggleExpanded(model, nodeId) }),

    // Entities

    DoubleClickedEntityName: ({ entityId }) => Entities.startRenaming(model, entityId),
    UpdatedEntityDraftName: ({ name }) => Entities.updateDraftName(model, name),
    ClickedDeleteEntity: ({ entityId }) => ({
      model: Session.deleteSelection({
        ...model,
        selection: Selection.SelectedEntity({ entityId }),
      }),
    }),

    // Attributes

    ClickedAddAttribute: ({ entityId }) => Entities.addAttribute(model, entityId),
    ClickedEditAttribute: ({ entityId, attributeId }) =>
      Entities.startEditingAttribute(finishEditing(model), entityId, attributeId),
    ClickedDeleteAttribute: ({ entityId, attributeId }) => ({
      model: Entities.deleteAttribute(model, entityId, attributeId),
    }),
    ClickedMoveAttribute: ({ entityId, attributeId, direction }) => ({
      model: commitDocument(model, (document) =>
        Doc.moveAttribute(document, entityId, attributeId, direction),
      ),
    }),
    UpdatedAttributeDraftName: ({ name }) =>
      updateAttributeDraft(model, (draft) => ({ ...draft, name })),
    SelectedAttributeDraftType: ({ type }) =>
      updateAttributeDraft(model, (draft) => ({ ...draft, type })),
    SelectedAttributeDraftMultiplicity: ({ multiplicity }) =>
      updateAttributeDraft(model, (draft) => selectDraftMultiplicity(draft, multiplicity)),
    ToggledAttributeDraftUnique: () => updateAttributeDraft(model, toggleDraftUnique),
    UpdatedAttributeDraftLiteralOptions: ({ text }) =>
      updateAttributeDraft(model, (draft) => ({ ...draft, literalOptions: text })),
    ClickedSaveAttribute: () => ({ model: finishEditing(model) }),
    ClickedCancelEdit: () => ({ model: cancelEditing(model) }),

    // Enums

    DoubleClickedEnumName: ({ typeId }) => Enums.startRenaming(model, typeId),
    UpdatedEnumDraftName: ({ name }) => Enums.updateDraftName(model, name),
    ClickedDeleteEnum: ({ typeId }) => ({
      model: Session.deleteSelection({ ...model, selection: Selection.SelectedEnum({ typeId }) }),
    }),
    ClickedAddEnumValue: ({ typeId }) => Enums.addValue(model, typeId),
    ClickedEditEnumValue: ({ typeId, valueId }) =>
      Enums.startEditingValue(finishEditing(model), typeId, valueId),
    ClickedDeleteEnumValue: ({ typeId, valueId }) => ({
      model: Enums.deleteValue(model, typeId, valueId),
    }),
    ClickedMoveEnumValue: ({ typeId, valueId, direction }) => ({
      model: commitDocument(model, (document) =>
        Doc.moveEnumValue(document, typeId, valueId, direction),
      ),
    }),
    UpdatedEnumValueDraftName: ({ name }) =>
      updateEnumValueDraft(model, (draft) => ({ ...draft, name })),
    UpdatedEnumValueDraftDescription: ({ description }) =>
      updateEnumValueDraft(model, (draft) => ({ ...draft, description })),
    ClickedSaveEnumValue: () => ({ model: finishEditing(model) }),

    // Associations

    ClickedEdge: ({ associationId }) => ({ model: Associations.inspect(model, associationId) }),
    ChangedAssociationName: ({ associationId, name }) => ({
      model: commitDocument(model, (document) =>
        Doc.renameAssociation(document, associationId, name),
      ),
    }),
    ChangedAssociationDescription: ({ associationId, description }) => ({
      model: commitDocument(model, (document) =>
        Doc.setAssociationDescription(document, associationId, description),
      ),
    }),
    SelectedEndMultiplicity: ({ associationId, endIndex, multiplicity }) => ({
      model: commitDocument(model, (document) =>
        Doc.setEndMultiplicity(document, associationId, endIndex, multiplicity),
      ),
    }),
    ChangedEndRole: ({ associationId, endIndex, role }) => ({
      model: commitDocument(model, (document) =>
        Doc.setEndRole(document, associationId, endIndex, role),
      ),
    }),
    ClickedDeleteAssociation: ({ associationId }) => ({
      model: Session.deleteSelection({
        ...model,
        selection: Selection.SelectedAssociation({ associationId }),
      }),
    }),
    ClickedCloseInspector: () => ({ model: deselect(toIdle(model)) }),

    // Files

    SucceededOpenFile: ({ document, fileName }) => ({
      model: Session.opened(model, document, fileName),
    }),
    FailedOpenFile: ({ error }) => ({
      model: Session.notify(model, { tone: "Error", text: error }),
    }),
    SucceededSaveFile: ({ fileName }) => ({ model: Session.saved(model, fileName) }),
    FailedSaveFile: ({ error }) => ({
      model: Session.notify(model, { tone: "Error", text: error }),
    }),
    CancelledFilePicker: () => ({ model }),
    CompletedForgetActiveFile: () => ({
      model: { ...model, maybeFileName: Option.none(), saveStatus: "Dirty" },
    }),
    CompletedFocusInput: () => ({ model }),
    ClickedDismissNotice: () => ({ model: { ...model, maybeNotice: Option.none() } }),

    // Window

    RequestedWindowClose: () => Session.requestClose(model),
    CompletedCloseWindow: () => ({ model }),
    CancelledCloseWindow: () => ({ model }),
  });
