import { Option } from "effect";

import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import type { Point } from "../domain/schema";
import { CardRow, EditorState, Selection, type Model } from "../model";
import { finishEditing } from "./editing";
import { connect } from "./associations";
import {
  commitDocument,
  deselect,
  present,
  setViewport,
  toIdle,
  toggleExpanded,
  toWorld,
  viewport,
  type UpdateReturn,
} from "./shared";

// Pointer gestures, pan, and zoom.

/** Screen-pixel movement below which a press and release is a click. */
const CLICK_TOLERANCE_PX = 3;

type Press = Readonly<{ button: number; clientX: number; clientY: number }>;

const isPanGesture = (model: Model, button: number): boolean =>
  button === 1 || (button === 0 && model.panKey === "Held");

const startPanning = (model: Model, clientX: number, clientY: number): Model => ({
  ...finishEditing(model),
  editor: EditorState.PanningCanvas({
    startPan: viewport(model).pan,
    startMouse: { x: clientX, y: clientY },
  }),
});

/** Routes a press to panning when it is a pan gesture, ignores secondary
 *  buttons, and otherwise hands it to `onPrimary`. */
const routePress = (model: Model, press: Press, onPrimary: () => UpdateReturn): UpdateReturn => {
  if (isPanGesture(model, press.button)) {
    return { model: startPanning(model, press.clientX, press.clientY) };
  }
  return press.button === 0 ? onPrimary() : { model };
};

// PRESSES

export const pressCanvas = (model: Model, press: Press): UpdateReturn =>
  routePress(model, press, () => ({ model: deselect(toIdle(finishEditing(model))) }));

/** Selects a card and starts dragging it by its header. */
const pressCardHeader = (
  model: Model,
  nodeId: string,
  selection: Selection,
  press: Press,
): UpdateReturn =>
  routePress(model, press, () => {
    const ready = finishEditing(model);
    return Option.match(Doc.findNode(present(ready), nodeId), {
      onNone: () => ({ model: ready }),
      onSome: (node) => {
        const pointer = toWorld(ready, press.clientX, press.clientY);
        return {
          model: {
            ...ready,
            editor: EditorState.DraggingNode({
              nodeId,
              offset: { x: pointer.x - node.position.x, y: pointer.y - node.position.y },
              origin: node.position,
              position: node.position,
            }),
            selection,
          },
        };
      },
    });
  });

export const pressNodeHeader = (model: Model, entityId: string, press: Press): UpdateReturn =>
  pressCardHeader(
    model,
    entityId,
    Selection.SelectedEntity({ entityId, row: CardRow.Title() }),
    press,
  );

export const pressEnumHeader = (model: Model, typeId: string, press: Press): UpdateReturn =>
  pressCardHeader(model, typeId, Selection.SelectedEnum({ typeId, row: CardRow.Title() }), press);

export const pressPort = (model: Model, entityId: string, press: Press): UpdateReturn =>
  routePress(model, press, () => {
    const ready = finishEditing(model);
    const pointer = toWorld(ready, press.clientX, press.clientY);
    return {
      model: {
        ...ready,
        editor: EditorState.ConnectingAssociation({
          fromEntityId: entityId,
          startPos: pointer,
          currentPos: pointer,
        }),
      },
    };
  });

// POINTER TRACKING

export const movePointer = (model: Model, clientX: number, clientY: number): UpdateReturn =>
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
      ConnectingAssociation: (state) => ({
        model: { ...model, editor: { ...state, currentPos: toWorld(model, clientX, clientY) } },
      }),
    },
    () => ({ model }),
  );

const releaseDrag = (model: Model, nodeId: string, origin: Point, position: Point): Model => {
  const isClick = Geometry.distance(origin, position) * viewport(model).zoom < CLICK_TOLERANCE_PX;
  // NOTE: a press and release without movement is a click, which toggles the
  // card open or closed in place.
  return toIdle(
    isClick
      ? toggleExpanded(model, nodeId)
      : commitDocument(model, (document) => Doc.moveNode(document, nodeId, position)),
  );
};

export const releasePointer = (
  model: Model,
  clientX: number,
  clientY: number,
  maybeTargetEntityId: Option.Option<string>,
): UpdateReturn =>
  EditorState.matchOrElse(
    model.editor,
    {
      DraggingNode: ({ nodeId, origin, position }) => ({
        model: releaseDrag(model, nodeId, origin, position),
      }),
      PanningCanvas: () => ({ model: toIdle(model) }),
      ConnectingAssociation: ({ fromEntityId, startPos }) => ({
        model: connect(
          model,
          fromEntityId,
          startPos,
          toWorld(model, clientX, clientY),
          maybeTargetEntityId,
        ),
      }),
    },
    () => ({ model }),
  );

// VIEWPORT

export const wheel = (
  model: Model,
  wheelEvent: Readonly<{
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    intent: Geometry.WheelIntent;
  }>,
): Model =>
  setViewport(
    model,
    wheelEvent.intent === "Zoom"
      ? Geometry.zoomAround(
          viewport(model),
          { x: wheelEvent.clientX, y: wheelEvent.clientY },
          viewport(model).zoom * Geometry.wheelZoomFactor(wheelEvent.deltaY),
        )
      : Geometry.panBy(viewport(model), { x: -wheelEvent.deltaX, y: -wheelEvent.deltaY }),
  );

export const zoomBy = (model: Model, factor: number): Model =>
  setViewport(
    model,
    Geometry.zoomAround(
      viewport(model),
      { x: model.screen.width / 2, y: model.screen.height / 2 },
      viewport(model).zoom * factor,
    ),
  );

/**
 * Select a card's title and center its persisted bounds without zooming or resizing.
 */
export const focusCard = (model: Model, nodeId: string): Model => {
  const document = present(model);
  const entity = Doc.findEntity(document, nodeId);
  const definition = Doc.findEnum(document, nodeId);
  const layout = Doc.findNode(document, nodeId);
  if (Option.isNone(layout)) {
    return model;
  }
  const rect = Option.isSome(entity)
    ? Geometry.nodeRect(entity.value, layout.value, Option.none())
    : Option.isSome(definition)
      ? Geometry.enumRect(definition.value, layout.value, Option.none())
      : undefined;
  if (rect === undefined) {
    return model;
  }
  const zoom = viewport(model).zoom;
  return setViewport(
    {
      ...model,
      selection: Option.isSome(entity)
        ? Selection.SelectedEntity({ entityId: nodeId, row: CardRow.Title() })
        : Selection.SelectedEnum({ typeId: nodeId, row: CardRow.Title() }),
    },
    {
      zoom,
      pan: {
        x: model.screen.width / 2 - (rect.x + rect.width / 2) * zoom,
        y: model.screen.height / 2 - (rect.y + rect.height / 2) * zoom,
      },
    },
  );
};

export const resetView = (model: Model): Model =>
  setViewport(model, Geometry.resetViewport(viewport(model), model.screen));

const fitCards = (model: Model, rects: ReadonlyArray<Geometry.Rect>, maximumZoom = 1): Model =>
  Option.match(Geometry.boundingRect(rects), {
    onNone: () => setViewport(model, Doc.DEFAULT_VIEWPORT),
    onSome: (bounds) => setViewport(model, Geometry.fitViewport(bounds, model.screen, maximumZoom)),
  });

export const fitToScreen = (model: Model): Model =>
  fitCards(model, Geometry.cardRects(present(model)));

export const zoomToSelection = (model: Model): Model => {
  const document = present(model);
  const nodeIds = Selection.match<ReadonlyArray<string>>(model.selection, {
    NoSelection: () => [],
    SelectedEntity: ({ entityId }) => [entityId],
    SelectedEnum: ({ typeId }) => [typeId],
    SelectedAssociation: ({ associationId }) =>
      Option.match(Doc.findAssociation(document, associationId), {
        onNone: () => [],
        onSome: (association) => association.ends.map((end) => end.entityId),
      }),
  });
  const rects = Geometry.cardRects({
    ...document,
    entities: document.entities.filter((entity) => nodeIds.includes(entity.id)),
    types: document.types.filter((definition) => nodeIds.includes(definition.id)),
  });
  return rects.length === 0 ? model : fitCards(model, rects, Geometry.MAX_ZOOM);
};
