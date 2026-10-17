import { Array, Option, pipe } from "effect";
import type { Update } from "foldkit";

import { FocusInput, ForgetFileHandle, OpenFile, SaveFile, SaveFileAs } from "./command";
import {
  CLICK_TOLERANCE_PX,
  DEFAULT_CARDINALITY,
  ENTITY_NAME_INPUT_ID,
  PROPERTY_NAME_INPUT_ID,
  SELF_REFERENCE_MIN_DRAG,
  ZOOM_STEP,
} from "./constant";
import * as Doc from "./domain/document";
import * as Geometry from "./domain/geometry";
import * as History from "./domain/history";
import type {
  DomainModelDocument,
  Point,
  PropertyDefinition,
  ViewportLayout,
} from "./domain/schema";
import { Message, type DraftFlag } from "./message";
import { EditorState, Selection, type Model, type PropertyDraft } from "./model";

type UpdateReturn = Update.Return<Model, Message>;

// MODEL HELPERS

const present = (model: Model): DomainModelDocument => model.history.present;

const viewport = (model: Model): ViewportLayout => present(model).layout.viewport;

const toWorld = (model: Model, clientX: number, clientY: number): Point =>
  Geometry.screenToWorld(viewport(model), { x: clientX, y: clientY });

/** Applies a discrete, undoable mutation to the document. */
const commitDocument = (
  model: Model,
  f: (document: DomainModelDocument) => DomainModelDocument,
): Model => {
  const history = History.commit(model.history, f);
  return history === model.history ? model : { ...model, history, saveStatus: "Dirty" };
};

/** Applies a transient change (pan, zoom, expansion) without a snapshot. */
const amendDocument = (
  model: Model,
  f: (document: DomainModelDocument) => DomainModelDocument,
): Model => ({ ...model, history: History.amend(model.history, f) });

const setViewport = (model: Model, next: ViewportLayout): Model =>
  amendDocument(model, (document) => Doc.setViewport(document, next));

const toIdle = (model: Model): Model => ({ ...model, editor: EditorState.Idle() });

const deselect = (model: Model): Model => ({
  ...model,
  selection: Selection.NoSelection(),
});

/** Drops a selection or edit state that refers to something no longer in the
 *  document, as happens after undo, redo, delete, or opening a file. */
const reconcile = (model: Model): Model => {
  const document = present(model);
  const hasEntity = (entityId: string) => Option.isSome(Doc.findEntity(document, entityId));
  const hasRelationship = (relationshipId: string) =>
    Option.isSome(Doc.findRelationship(document, relationshipId));

  const selection = Selection.match(model.selection, {
    NoSelection: () => model.selection,
    SelectedEntity: ({ entityId }) =>
      hasEntity(entityId) ? model.selection : Selection.NoSelection(),
    SelectedRelationship: ({ relationshipId }) =>
      hasRelationship(relationshipId) ? model.selection : Selection.NoSelection(),
  });

  const isEditorValid = EditorState.match(model.editor, {
    Idle: () => true,
    CreatingEntity: () => true,
    RenamingEntity: ({ entityId }) => hasEntity(entityId),
    EditingProperty: ({ entityId, propertyId }) =>
      pipe(
        Doc.findEntity(document, entityId),
        Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
        Option.isSome,
      ),
    ConnectingRelationship: ({ sourceEntityId }) => hasEntity(sourceEntityId),
    EditingRelationship: ({ relationshipId }) => hasRelationship(relationshipId),
    DraggingNode: ({ entityId }) => hasEntity(entityId),
    PanningCanvas: () => true,
  });

  return {
    ...model,
    selection,
    editor: isEditorValid ? model.editor : EditorState.Idle(),
  };
};

const focus = (id: string) => FocusInput({ selector: `#${id}` });

// PROPERTY DRAFTS

export const draftFromProperty = (property: PropertyDefinition): PropertyDraft => ({
  name: property.name,
  type: property.type,
  literalOptions: (property.literalOptions ?? []).join(", "),
  isId: property.isId,
  isOptional: property.isOptional,
  isNullable: property.isNullable,
});

const parseLiteralOptions = (text: string): ReadonlyArray<string> =>
  pipe(
    text.split(","),
    Array.map((option) => option.trim()),
    Array.filter((option) => option !== ""),
    Array.dedupe,
  );

export const propertyFromDraft = (
  property: PropertyDefinition,
  draft: PropertyDraft,
): PropertyDefinition => {
  const { literalOptions: _literalOptions, ...rest } = property;
  const name = draft.name.trim();
  return {
    ...rest,
    name: name === "" ? property.name : name,
    type: draft.type,
    isId: draft.isId,
    isOptional: draft.isOptional,
    isNullable: draft.isNullable,
    ...(draft.type === "Literal"
      ? { literalOptions: parseLiteralOptions(draft.literalOptions) }
      : {}),
  };
};

const toggleDraftFlag = (draft: PropertyDraft, flag: DraftFlag): PropertyDraft => ({
  ...draft,
  [flag]: !draft[flag],
});

// EDIT COMPLETION

const commitCreateEntity = (model: Model, position: Point, draftName: string): Model => {
  const name = draftName.trim();
  if (name === "") {
    return toIdle(model);
  }
  const entityId = Doc.nextId(present(model), "e");
  return {
    ...commitDocument(model, (document) => Doc.addEntity(document, entityId, name, position)),
    editor: EditorState.Idle(),
    selection: Selection.SelectedEntity({ entityId }),
  };
};

const commitRenameEntity = (model: Model, entityId: string, draftName: string): Model => {
  const name = draftName.trim();
  return toIdle(
    name === ""
      ? model
      : commitDocument(model, (document) => Doc.renameEntity(document, entityId, name)),
  );
};

const commitPropertyEdit = (
  model: Model,
  entityId: string,
  propertyId: string,
  draft: PropertyDraft,
): Model =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
    Option.match({
      onNone: () => toIdle(model),
      onSome: (property) =>
        toIdle(
          commitDocument(model, (document) =>
            Doc.replaceProperty(document, entityId, propertyFromDraft(property, draft)),
          ),
        ),
    }),
  );

/** Completes whatever text edit is in progress (committing it), closes the
 *  relationship inspector, and returns to Idle. Pointer interactions are left
 *  alone because they complete on pointer release. */
const finishEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => model,
    CreatingEntity: ({ position, draftName }) => commitCreateEntity(model, position, draftName),
    RenamingEntity: ({ entityId, draftName }) => commitRenameEntity(model, entityId, draftName),
    EditingProperty: ({ entityId, propertyId, draft }) =>
      commitPropertyEdit(model, entityId, propertyId, draft),
    EditingRelationship: () => toIdle(model),
    ConnectingRelationship: () => toIdle(model),
    DraggingNode: () => model,
    PanningCanvas: () => model,
  });

/** Abandons the edit in progress without committing it. */
const cancelEditing = (model: Model): Model =>
  EditorState.match(model.editor, {
    Idle: () => deselect(model),
    CreatingEntity: () => toIdle(model),
    RenamingEntity: () => toIdle(model),
    EditingProperty: () => toIdle(model),
    ConnectingRelationship: () => toIdle(model),
    EditingRelationship: () => deselect(toIdle(model)),
    DraggingNode: () => toIdle(model),
    PanningCanvas: ({ startPan }) =>
      toIdle(setViewport(model, { ...viewport(model), pan: startPan })),
  });

// ACTIONS

const startCreatingEntity = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  const center = toWorld(ready, ready.screen.width / 2, ready.screen.height / 2);
  const position = {
    x: center.x - Geometry.COLLAPSED_NODE_WIDTH / 2,
    y: center.y - Geometry.NODE_HEADER_HEIGHT / 2,
  };
  return {
    model: {
      ...ready,
      editor: EditorState.CreatingEntity({ position, draftName: "" }),
      selection: Selection.NoSelection(),
    },
    commands: [focus(ENTITY_NAME_INPUT_ID)],
  };
};

const startRenamingEntity = (model: Model, entityId: string): UpdateReturn =>
  Option.match(Doc.findEntity(present(model), entityId), {
    onNone: () => ({ model }),
    onSome: (entity) => ({
      model: {
        ...finishEditing(model),
        editor: EditorState.RenamingEntity({ entityId, draftName: entity.name }),
        selection: Selection.SelectedEntity({ entityId }),
      },
      commands: [focus(ENTITY_NAME_INPUT_ID)],
    }),
  });

const startEditingProperty = (model: Model, entityId: string, propertyId: string): UpdateReturn =>
  pipe(
    Doc.findEntity(present(model), entityId),
    Option.flatMap((entity) => Doc.findProperty(entity, propertyId)),
    Option.match({
      onNone: () => ({ model }),
      onSome: (property) => ({
        model: {
          ...amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
          editor: EditorState.EditingProperty({
            entityId,
            propertyId,
            draft: draftFromProperty(property),
          }),
          selection: Selection.SelectedEntity({ entityId }),
        },
        commands: [focus(PROPERTY_NAME_INPUT_ID)],
      }),
    }),
  );

const deleteSelection = (model: Model): Model =>
  reconcile(
    deselect(
      toIdle(
        Selection.match(model.selection, {
          NoSelection: () => model,
          SelectedEntity: ({ entityId }) =>
            commitDocument(model, (document) => Doc.deleteEntity(document, entityId)),
          SelectedRelationship: ({ relationshipId }) =>
            commitDocument(model, (document) => Doc.deleteRelationship(document, relationshipId)),
        }),
      ),
    ),
  );

const undo = (model: Model): Model =>
  Option.match(History.undo(model.history), {
    onNone: () => model,
    onSome: (history) => reconcile({ ...toIdle(model), history, saveStatus: "Dirty" }),
  });

const redo = (model: Model): Model =>
  Option.match(History.redo(model.history), {
    onNone: () => model,
    onSome: (history) => reconcile({ ...toIdle(model), history, saveStatus: "Dirty" }),
  });

const zoomBy = (model: Model, factor: number): Model =>
  setViewport(
    model,
    Geometry.zoomAround(
      viewport(model),
      { x: model.screen.width / 2, y: model.screen.height / 2 },
      viewport(model).zoom * factor,
    ),
  );

const fitToScreen = (model: Model): Model =>
  Option.match(Geometry.documentBounds(present(model)), {
    onNone: () => setViewport(model, Doc.DEFAULT_VIEWPORT),
    onSome: (bounds) => setViewport(model, Geometry.fitViewport(bounds, model.screen)),
  });

const isPanGesture = (model: Model, button: number): boolean =>
  button === 1 || (button === 0 && model.panKey === "Held");

const startPanning = (model: Model, clientX: number, clientY: number): Model => ({
  ...finishEditing(model),
  editor: EditorState.PanningCanvas({
    startPan: viewport(model).pan,
    startMouse: { x: clientX, y: clientY },
  }),
});

const save = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return { model: ready, commands: [SaveFile({ document: present(ready) })] };
};

const saveAs = (model: Model): UpdateReturn => {
  const ready = finishEditing(model);
  return { model: ready, commands: [SaveFileAs({ document: present(ready) })] };
};

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const releaseDrag = (model: Model, entityId: string, origin: Point, position: Point): Model => {
  const isClick = distance(origin, position) * viewport(model).zoom < CLICK_TOLERANCE_PX;
  if (isClick) {
    // NOTE: a press and release without movement is a click, which toggles
    // the card open or closed in place.
    return toIdle(
      amendDocument(model, (document) =>
        Doc.setExpanded(
          document,
          entityId,
          !Option.exists(Doc.findNode(document, entityId), (node) => node.isExpanded),
        ),
      ),
    );
  }
  return toIdle(commitDocument(model, (document) => Doc.moveNode(document, entityId, position)));
};

const releaseConnection = (
  model: Model,
  sourceEntityId: string,
  maybeSourcePropertyId: Option.Option<string>,
  startPos: Point,
  endPos: Point,
  maybeTargetEntityId: Option.Option<string>,
): Model => {
  const maybeValidTarget = Option.filter(
    maybeTargetEntityId,
    (targetEntityId) =>
      Option.isSome(Doc.findEntity(present(model), targetEntityId)) &&
      (targetEntityId !== sourceEntityId || distance(startPos, endPos) > SELF_REFERENCE_MIN_DRAG),
  );
  return Option.match(maybeValidTarget, {
    onNone: () => toIdle(model),
    onSome: (targetEntityId) => {
      const relationshipId = Doc.nextId(present(model), "r");
      return {
        ...commitDocument(model, (document) =>
          Doc.addRelationship(document, {
            id: relationshipId,
            sourceEntityId,
            targetEntityId,
            cardinality: DEFAULT_CARDINALITY,
            ...Option.match(maybeSourcePropertyId, {
              onNone: () => ({}),
              onSome: (sourcePropertyId) => ({ sourcePropertyId }),
            }),
          }),
        ),
        editor: EditorState.EditingRelationship({ relationshipId }),
        selection: Selection.SelectedRelationship({ relationshipId }),
      };
    },
  });
};

const updatePropertyDraft = (
  model: Model,
  f: (draft: PropertyDraft) => PropertyDraft,
): UpdateReturn => ({
  model:
    model.editor._tag === "EditingProperty"
      ? { ...model, editor: { ...model.editor, draft: f(model.editor.draft) } }
      : model,
});

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    // Keyboard

    PressedCreateEntityKey: () => startCreatingEntity(model),

    PressedDeleteKey: () => ({ model: deleteSelection(model) }),

    PressedUndoKey: () => ({ model: undo(model) }),

    PressedRedoKey: () => ({ model: redo(model) }),

    PressedEditKey: () =>
      Selection.match(model.selection, {
        NoSelection: () => ({ model }),
        SelectedRelationship: ({ relationshipId }) => ({
          model: { ...model, editor: EditorState.EditingRelationship({ relationshipId }) },
        }),
        SelectedEntity: ({ entityId }) =>
          startRenamingEntity(
            amendDocument(model, (document) => Doc.setExpanded(document, entityId, true)),
            entityId,
          ),
      }),

    PressedEnterKey: () =>
      model.editor._tag === "Idle"
        ? update(model, Message.PressedEditKey())
        : { model: finishEditing(model) },

    PressedEscapeKey: () => ({ model: cancelEditing(model) }),

    PressedSaveKey: () => save(model),

    PressedSaveAsKey: () => saveAs(model),

    PressedOpenKey: () => ({ model: finishEditing(model), commands: [OpenFile()] }),

    PressedSpace: () => ({ model: { ...model, panKey: "Held" } }),

    ReleasedSpace: () => ({ model: { ...model, panKey: "Released" } }),

    // Pointer & canvas

    PressedCanvas: ({ button, clientX, clientY }) => {
      if (isPanGesture(model, button)) {
        return { model: startPanning(model, clientX, clientY) };
      }
      if (button !== 0) {
        return { model };
      }
      return { model: deselect(toIdle(finishEditing(model))) };
    },

    PressedNodeHeader: ({ entityId, button, clientX, clientY }) => {
      if (isPanGesture(model, button)) {
        return { model: startPanning(model, clientX, clientY) };
      }
      if (button !== 0) {
        return { model };
      }
      const ready = finishEditing(model);
      return Option.match(Doc.findNode(present(ready), entityId), {
        onNone: () => ({ model: ready }),
        onSome: (node) => {
          const pointer = toWorld(ready, clientX, clientY);
          return {
            model: {
              ...ready,
              editor: EditorState.DraggingNode({
                entityId,
                offset: {
                  x: pointer.x - node.position.x,
                  y: pointer.y - node.position.y,
                },
                origin: node.position,
                position: node.position,
              }),
              selection: Selection.SelectedEntity({ entityId }),
            },
          };
        },
      });
    },

    PressedPort: ({ entityId, maybePropertyId, button, clientX, clientY }) => {
      if (isPanGesture(model, button)) {
        return { model: startPanning(model, clientX, clientY) };
      }
      if (button !== 0) {
        return { model };
      }
      const ready = finishEditing(model);
      const pointer = toWorld(ready, clientX, clientY);
      return {
        model: {
          ...ready,
          editor: EditorState.ConnectingRelationship({
            sourceEntityId: entityId,
            maybeSourcePropertyId: maybePropertyId,
            startPos: pointer,
            currentPos: pointer,
          }),
        },
      };
    },

    MovedPointer: ({ clientX, clientY }) =>
      EditorState.matchOrElse(
        model.editor,
        {
          DraggingNode: (state) => {
            const pointer = toWorld(model, clientX, clientY);
            return {
              model: {
                ...model,
                editor: {
                  ...state,
                  position: { x: pointer.x - state.offset.x, y: pointer.y - state.offset.y },
                },
              },
            };
          },
          PanningCanvas: ({ startPan, startMouse }) => ({
            model: setViewport(model, {
              ...viewport(model),
              pan: {
                x: startPan.x + clientX - startMouse.x,
                y: startPan.y + clientY - startMouse.y,
              },
            }),
          }),
          ConnectingRelationship: (state) => ({
            model: {
              ...model,
              editor: { ...state, currentPos: toWorld(model, clientX, clientY) },
            },
          }),
        },
        () => ({ model }),
      ),

    ReleasedPointer: ({ clientX, clientY, maybeTargetEntityId }) =>
      EditorState.matchOrElse(
        model.editor,
        {
          DraggingNode: ({ entityId, origin, position }) => ({
            model: releaseDrag(model, entityId, origin, position),
          }),
          PanningCanvas: () => ({ model: toIdle(model) }),
          ConnectingRelationship: ({ sourceEntityId, maybeSourcePropertyId, startPos }) => ({
            model: releaseConnection(
              model,
              sourceEntityId,
              maybeSourcePropertyId,
              startPos,
              toWorld(model, clientX, clientY),
              maybeTargetEntityId,
            ),
          }),
        },
        () => ({ model }),
      ),

    WheeledCanvas: ({ clientX, clientY, deltaX, deltaY, intent }) => ({
      model: setViewport(
        model,
        intent === "Zoom"
          ? Geometry.zoomAround(
              viewport(model),
              { x: clientX, y: clientY },
              viewport(model).zoom * Geometry.wheelZoomFactor(deltaY),
            )
          : Geometry.panBy(viewport(model), { x: -deltaX, y: -deltaY }),
      ),
    }),

    ResizedScreen: ({ width, height }) => ({ model: { ...model, screen: { width, height } } }),

    // HUD

    ClickedZoomIn: () => ({ model: zoomBy(model, ZOOM_STEP) }),

    ClickedZoomOut: () => ({ model: zoomBy(model, 1 / ZOOM_STEP) }),

    ClickedResetView: () => ({
      model: setViewport(model, Geometry.resetViewport(viewport(model), model.screen)),
    }),

    ClickedFitToScreen: () => ({ model: fitToScreen(model) }),

    // Toolbar

    ClickedNewDocument: () => ({
      model: deselect(
        toIdle(commitDocument(finishEditing(model), () => Doc.emptyDocument("Untitled"))),
      ),
      commands: [ForgetFileHandle()],
    }),

    ClickedOpen: () => ({ model: finishEditing(model), commands: [OpenFile()] }),

    ClickedSave: () => save(model),

    ClickedSaveAs: () => saveAs(model),

    ClickedUndo: () => ({ model: undo(model) }),

    ClickedRedo: () => ({ model: redo(model) }),

    ClickedAddEntity: () => startCreatingEntity(model),

    ChangedDocumentName: ({ name }) => ({
      model:
        name.trim() === ""
          ? model
          : commitDocument(model, (document) => Doc.renameDocument(document, name.trim())),
    }),

    // Entities

    ClickedToggleExpand: ({ entityId }) => ({
      model: amendDocument(model, (document) =>
        Doc.setExpanded(
          document,
          entityId,
          !Option.exists(Doc.findNode(document, entityId), (node) => node.isExpanded),
        ),
      ),
    }),

    DoubleClickedEntityName: ({ entityId }) => startRenamingEntity(model, entityId),

    UpdatedEntityDraftName: ({ name }) => ({
      model: EditorState.matchOrElse(
        model.editor,
        {
          CreatingEntity: (state) => ({ ...model, editor: { ...state, draftName: name } }),
          RenamingEntity: (state) => ({ ...model, editor: { ...state, draftName: name } }),
        },
        () => model,
      ),
    }),

    ClickedDeleteEntity: ({ entityId }) => ({
      model: deleteSelection({
        ...model,
        selection: Selection.SelectedEntity({ entityId }),
      }),
    }),

    // Properties

    ClickedAddProperty: ({ entityId }) =>
      Option.match(Doc.findEntity(present(model), entityId), {
        onNone: () => ({ model }),
        onSome: (entity) => {
          const ready = finishEditing(model);
          const propertyId = Doc.nextId(present(ready), "p");
          const property = Doc.newProperty(propertyId, `field${entity.properties.length + 1}`);
          return startEditingProperty(
            commitDocument(ready, (document) => Doc.addProperty(document, entityId, property)),
            entityId,
            propertyId,
          );
        },
      }),

    ClickedEditProperty: ({ entityId, propertyId }) =>
      startEditingProperty(finishEditing(model), entityId, propertyId),

    ClickedDeleteProperty: ({ entityId, propertyId }) => ({
      model: reconcile(
        commitDocument(model, (document) => Doc.deleteProperty(document, entityId, propertyId)),
      ),
    }),

    ClickedMoveProperty: ({ entityId, propertyId, direction }) => ({
      model: commitDocument(model, (document) =>
        Doc.moveProperty(document, entityId, propertyId, direction),
      ),
    }),

    UpdatedPropertyDraftName: ({ name }) =>
      updatePropertyDraft(model, (draft) => ({ ...draft, name })),

    SelectedPropertyDraftType: ({ type }) =>
      updatePropertyDraft(model, (draft) => ({ ...draft, type })),

    ToggledPropertyDraftFlag: ({ flag }) =>
      updatePropertyDraft(model, (draft) => toggleDraftFlag(draft, flag)),

    UpdatedPropertyDraftLiteralOptions: ({ text }) =>
      updatePropertyDraft(model, (draft) => ({ ...draft, literalOptions: text })),

    ClickedSaveProperty: () => ({ model: finishEditing(model) }),

    ClickedCancelEdit: () => ({ model: cancelEditing(model) }),

    // Relationships

    ClickedEdge: ({ relationshipId }) => ({
      model: {
        ...finishEditing(model),
        editor: EditorState.EditingRelationship({ relationshipId }),
        selection: Selection.SelectedRelationship({ relationshipId }),
      },
    }),

    SelectedCardinality: ({ relationshipId, cardinality }) => ({
      model: commitDocument(model, (document) =>
        Doc.setCardinality(document, relationshipId, cardinality),
      ),
    }),

    ClickedReverseRelationship: ({ relationshipId }) => ({
      model: commitDocument(model, (document) => Doc.reverseRelationship(document, relationshipId)),
    }),

    SelectedRelationshipProperty: ({ relationshipId, end, maybePropertyId }) => ({
      model: commitDocument(model, (document) =>
        Doc.bindRelationshipProperty(document, relationshipId, end, maybePropertyId),
      ),
    }),

    ChangedRelationshipName: ({ relationshipId, name }) => ({
      model: commitDocument(model, (document) =>
        Doc.renameRelationship(document, relationshipId, name),
      ),
    }),

    ClickedDeleteRelationship: ({ relationshipId }) => ({
      model: deleteSelection({
        ...model,
        selection: Selection.SelectedRelationship({ relationshipId }),
      }),
    }),

    ClickedCloseInspector: () => ({ model: deselect(toIdle(model)) }),

    // Files

    SucceededOpenFile: ({ document, fileName }) => ({
      model: {
        ...model,
        history: History.init(Doc.syncLayout(document)),
        editor: EditorState.Idle(),
        selection: Selection.NoSelection(),
        maybeFileName: Option.some(fileName),
        saveStatus: "Clean",
        maybeNotice: Option.none(),
      },
    }),

    FailedOpenFile: ({ error }) => ({
      model: { ...model, maybeNotice: Option.some({ tone: "Error", text: error }) },
    }),

    SucceededSaveFile: ({ fileName }) => ({
      model: {
        ...model,
        maybeFileName: Option.some(fileName),
        saveStatus: "Clean",
        maybeNotice: Option.some({ tone: "Info", text: `Saved ${fileName}` }),
      },
    }),

    FailedSaveFile: ({ error }) => ({
      model: { ...model, maybeNotice: Option.some({ tone: "Error", text: error }) },
    }),

    CancelledFilePicker: () => ({ model }),

    CompletedForgetFileHandle: () => ({
      model: { ...model, maybeFileName: Option.none(), saveStatus: "Dirty" },
    }),

    CompletedFocusInput: () => ({ model }),

    ClickedDismissNotice: () => ({ model: { ...model, maybeNotice: Option.none() } }),
  });
