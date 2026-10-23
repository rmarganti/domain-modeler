import { Option } from "effect";

import { FocusInput } from "./command";
import * as Doc from "./domain/document";
import { ZOOM_STEP } from "./domain/geometry";
import { Message } from "./message";
import { CardRow, EditorState, Selection, type Model } from "./model";
import * as Canvas from "./update/canvas";
import * as Chooser from "./update/chooser";
import * as Picker from "./update/picker";
import {
  cancelEditing,
  finishEditing,
  selectDraftMultiplicity,
  toggleDraftUnique,
  updateAttributeDraft,
  updateEnumValueDraft,
} from "./update/editing";
import * as Entities from "./update/entities";
import * as Rows from "./update/rows";
import * as Enums from "./update/enums";
import * as Associations from "./update/associations";
import * as Disk from "./update/disk";
import * as Session from "./update/session";
import {
  commitDocument,
  deselect,
  toIdle,
  toggleExpanded,
  type UpdateReturn,
} from "./update/shared";

const showShortcuts = (model: Model): UpdateReturn => ({
  model: { ...model, editor: EditorState.ViewingShortcuts(), panKey: "Released" },
  commands: [FocusInput({ selector: "#keyboard-shortcuts" })],
});

/** Handles a message, then merges any change from disk the editor is now free for. */
export const update = (model: Model, message: Message): UpdateReturn => {
  const result = handle(model, message);
  const merged = Disk.applyPending(result.model);
  return merged === result.model ? result : { ...result, model: merged };
};

// Every Message is handled here, so exhaustiveness is checked in one place.
// Handlers with any logic live in the area modules under ./update/.

const handle = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    // Keyboard

    PressedNewKey: () => ({ model: Chooser.open(model) }),
    PressedFindCardKey: () => Picker.open(model),
    PressedConnectKey: () => Picker.openConnect(model),
    UpdatedCardQuery: ({ query }) => Picker.changeQuery(model, query),
    MovedCardHighlight: ({ direction }) => Picker.moveHighlight(model, direction),
    PickedCard: ({ nodeId }) => ({ model: Picker.pick(model, nodeId) }),
    CompletedRevealCardOption: () => ({ model }),
    PressedZoomToSelectionKey: () => ({ model: Canvas.zoomToSelection(model) }),
    PressedShortcutsKey: () =>
      model.editor._tag === "ViewingShortcuts" ? { model: toIdle(model) } : showShortcuts(model),
    PressedDeleteKey: () => ({ model: Session.deleteSelection(model) }),
    PressedEditKey: () => Rows.edit(model),
    NavigatedCard: ({ direction }) => ({ model: Canvas.navigateCards(model, direction) }),
    MovedCardRow: ({ motion }) => ({ model: Rows.move(model, motion) }),
    InsertedCardRow: ({ position }) => Rows.insert(model, position),
    ReorderedCardRow: ({ direction }) => ({ model: Rows.reorder(model, direction) }),
    PressedToggleExpandKey: () => ({ model: Rows.toggleExpanded(model) }),
    PressedEnterKey: () =>
      EditorState.matchOrElse(
        model.editor,
        {
          Idle: () => Rows.edit(model),
          ChoosingNew: ({ highlighted }) => Chooser.pick(model, highlighted),
          PickingCard: () => ({ model: Picker.pickHighlighted(model) }),
        },
        () => ({ model: finishEditing(model) }),
      ),
    PressedEscapeKey: () => ({ model: cancelEditing(model) }),
    PressedReloadFromDiskKey: () => Disk.reload(model),
    PressedSpace: () => ({ model: { ...model, panKey: "Held" } }),
    ReleasedSpace: () => ({ model: { ...model, panKey: "Released" } }),

    // New… chooser

    MovedChooserHighlight: ({ direction }) => ({
      model: Chooser.moveHighlight(model, direction),
    }),
    PickedNew: ({ kind }) => Chooser.pick(model, kind),

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

    // Shared by a key and a control (see ARCHITECTURE.md)

    RequestedNewDocument: () => ({ model: Session.newDocument(model) }),
    RequestedOpen: () => Session.open(model),
    RequestedSave: () => Session.save(model),
    RequestedSaveAs: () => Session.saveAs(model),
    RequestedUndo: () => ({ model: Session.undo(model) }),
    RequestedRedo: () => ({ model: Session.redo(model) }),
    RequestedZoomIn: () => ({ model: Canvas.zoomBy(model, ZOOM_STEP) }),
    RequestedZoomOut: () => ({ model: Canvas.zoomBy(model, 1 / ZOOM_STEP) }),
    RequestedResetView: () => ({ model: Canvas.resetView(model) }),
    RequestedFitToScreen: () => ({ model: Canvas.fitToScreen(model) }),

    // Toolbar

    ClickedShowShortcuts: () => showShortcuts(model),
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
        selection: Selection.SelectedEntity({ entityId, row: CardRow.Title() }),
      }),
    }),

    // Attributes

    ClickedAddAttribute: ({ entityId }) => Entities.addAttribute(model, entityId),
    ClickedAttributeRow: ({ entityId, attributeId }) => ({
      model: Rows.select(
        model,
        Selection.SelectedEntity({ entityId, row: CardRow.Attribute({ attributeId }) }),
      ),
    }),
    ClickedEditAttribute: ({ entityId, attributeId }) =>
      Entities.startEditingAttribute(finishEditing(model), entityId, attributeId),
    ClickedDeleteAttribute: ({ entityId, attributeId }) => ({
      model: Entities.deleteAttribute(model, entityId, attributeId),
    }),
    ClickedMoveAttribute: ({ entityId, attributeId, direction }) => ({
      model: Entities.moveAttribute(model, entityId, attributeId, direction),
    }),
    UpdatedAttributeDraftName: ({ name }) =>
      updateAttributeDraft(model, (draft) => ({ ...draft, name })),
    SelectedAttributeDraftType: ({ type }) =>
      updateAttributeDraft(model, (draft) => ({ ...draft, type })),
    SelectedAttributeDraftNewEnum: () => Entities.addEnumForAttribute(model),
    SelectedAttributeDraftMultiplicity: ({ multiplicity }) =>
      updateAttributeDraft(model, (draft) => selectDraftMultiplicity(draft, multiplicity)),
    ToggledAttributeDraftUnique: () => updateAttributeDraft(model, toggleDraftUnique),
    ClickedSaveAttribute: () => ({ model: finishEditing(model) }),
    ClickedCancelEdit: () => ({ model: cancelEditing(model) }),

    // Enums

    ClickedGoToEnum: ({ typeId }) => ({ model: Enums.select(model, typeId) }),
    DoubleClickedEnumName: ({ typeId }) => Enums.startRenaming(model, typeId),
    UpdatedEnumDraftName: ({ name }) => Enums.updateDraftName(model, name),
    ClickedDeleteEnum: ({ typeId }) => ({
      model: Session.deleteSelection({
        ...model,
        selection: Selection.SelectedEnum({ typeId, row: CardRow.Title() }),
      }),
    }),
    ClickedAddEnumValue: ({ typeId }) => Enums.addValue(model, typeId),
    ClickedEnumValueRow: ({ typeId, valueId }) => ({
      model: Rows.select(
        model,
        Selection.SelectedEnum({ typeId, row: CardRow.Value({ valueId }) }),
      ),
    }),
    ClickedEditEnumValue: ({ typeId, valueId }) =>
      Enums.startEditingValue(finishEditing(model), typeId, valueId),
    ClickedDeleteEnumValue: ({ typeId, valueId }) => ({
      model: Enums.deleteValue(model, typeId, valueId),
    }),
    ClickedMoveEnumValue: ({ typeId, valueId, direction }) => ({
      model: Enums.moveValue(model, typeId, valueId, direction),
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

    SucceededOpenFile: ({ document, path }) => ({
      model: Session.opened(model, document, path),
    }),
    FailedOpenFile: ({ error }) => ({
      model: Session.notify(model, { tone: "Error", text: error }),
    }),
    SucceededSaveFile: ({ document, path }) => ({
      model: Session.saved(model, document, path),
    }),
    FailedSaveFile: ({ error }) => ({
      model: Session.notify(model, { tone: "Error", text: error }),
    }),
    CancelledFilePicker: () => ({ model }),
    CompletedFocusInput: () => ({ model }),
    ClickedDismissNotice: () => ({ model: { ...model, maybeNotice: Option.none() } }),

    // External edits to the open file

    ChangedFileOnDisk: () => Disk.check(model),
    FocusedWindow: () => Disk.check(model),
    ReadFileOnDisk: ({ path, document }) => ({ model: Disk.read(model, path, document) }),
    FailedReadFileOnDisk: ({ path, issue }) => ({ model: Disk.failedRead(model, path, issue) }),
    SucceededReloadFile: ({ path, document }) => ({
      model: Disk.reloaded(model, path, document),
    }),
    FailedReloadFile: ({ path, issue }) => ({ model: Disk.failedReload(model, path, issue) }),

    // Window

    RequestedWindowClose: () => Session.requestClose(model),
    CompletedCloseWindow: () => ({ model }),
    CancelledCloseWindow: () => ({ model }),
  });
