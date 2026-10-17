import { Option } from "effect";

import * as Doc from "../domain/document";
import * as Geometry from "../domain/geometry";
import type { Point } from "../domain/schema";
import { EditorState, Selection, type Model } from "../model";
import { finishEditing } from "./editing";
import { connect } from "./relationships";
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

export const pressNodeHeader = (model: Model, entityId: string, press: Press): UpdateReturn =>
  routePress(model, press, () => {
    const ready = finishEditing(model);
    return Option.match(Doc.findNode(present(ready), entityId), {
      onNone: () => ({ model: ready }),
      onSome: (node) => {
        const pointer = toWorld(ready, press.clientX, press.clientY);
        return {
          model: {
            ...ready,
            editor: EditorState.DraggingNode({
              entityId,
              offset: { x: pointer.x - node.position.x, y: pointer.y - node.position.y },
              origin: node.position,
              position: node.position,
            }),
            selection: Selection.SelectedEntity({ entityId }),
          },
        };
      },
    });
  });

export const pressPort = (
  model: Model,
  entityId: string,
  maybePropertyId: Option.Option<string>,
  press: Press,
): UpdateReturn =>
  routePress(model, press, () => {
    const ready = finishEditing(model);
    const pointer = toWorld(ready, press.clientX, press.clientY);
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
      ConnectingRelationship: (state) => ({
        model: { ...model, editor: { ...state, currentPos: toWorld(model, clientX, clientY) } },
      }),
    },
    () => ({ model }),
  );

const releaseDrag = (model: Model, entityId: string, origin: Point, position: Point): Model => {
  const isClick = Geometry.distance(origin, position) * viewport(model).zoom < CLICK_TOLERANCE_PX;
  // NOTE: a press and release without movement is a click, which toggles the
  // card open or closed in place.
  return toIdle(
    isClick
      ? toggleExpanded(model, entityId)
      : commitDocument(model, (document) => Doc.moveNode(document, entityId, position)),
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
      DraggingNode: ({ entityId, origin, position }) => ({
        model: releaseDrag(model, entityId, origin, position),
      }),
      PanningCanvas: () => ({ model: toIdle(model) }),
      ConnectingRelationship: ({ sourceEntityId, maybeSourcePropertyId, startPos }) => ({
        model: connect(
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

export const resetView = (model: Model): Model =>
  setViewport(model, Geometry.resetViewport(viewport(model), model.screen));

export const fitToScreen = (model: Model): Model =>
  Option.match(Geometry.documentBounds(present(model)), {
    onNone: () => setViewport(model, Doc.DEFAULT_VIEWPORT),
    onSome: (bounds) => setViewport(model, Geometry.fitViewport(bounds, model.screen)),
  });
