import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { CANVAS_ID, CANVAS_ITEM_ATTRIBUTE } from "../dom";
import * as Diagnostics from "../domain/diagnostics";
import { bezierRouter, type EdgeRouter } from "../domain/edgeRouter";
import type { DomainModelDocument } from "../domain/schema";
import { Message } from "../message";
import type { Model } from "../model";
import {
  connectorPreview,
  edgeGeometry,
  edgeLabel,
  edgePath,
  inspectorView,
  markerDefs,
} from "./edge";
import { creatingNodeView, nodeView } from "./node";
import { onPress, px } from "./shared";

const GRID_SIZE = 24;

const router: EdgeRouter = bezierRouter;

const cursorFor = (model: Model): string => {
  switch (model.editor._tag) {
    case "PanningCanvas":
      return "cursor-grabbing";
    case "ConnectingAssociation":
      return "cursor-crosshair";
    case "DraggingNode":
      return "cursor-grabbing";
    default:
      return model.panKey === "Held" ? "cursor-grab" : "cursor-default";
  }
};

const gridStyle = (document: DomainModelDocument): Record<string, string> => {
  const { pan, zoom } = document.layout.viewport;
  const size = GRID_SIZE * zoom;
  return {
    backgroundImage: `radial-gradient(circle, #cbd5e1 ${Math.max(zoom, 0.6)}px, transparent ${Math.max(zoom, 0.6)}px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${pan.x}px ${pan.y}px`,
    touchAction: "none",
  };
};

const worldTransform = (document: DomainModelDocument): string => {
  const { pan, zoom } = document.layout.viewport;
  return `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
};

export const canvasView = (
  model: Model,
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>,
  h: HtmlBuilder<Message>,
): Html => {
  const document = model.history.present;
  const { editor, selection } = model;
  const maybeEditingPropertyId =
    editor._tag === "EditingProperty" ? Option.some(editor.propertyId) : Option.none<string>();

  const edges = Array.getSomes(
    Array.map(document.associations, (association) =>
      edgeGeometry(document, association, editor, router),
    ),
  );
  const isEdgeSelected = (associationId: string) =>
    selection._tag === "SelectedAssociation" && selection.associationId === associationId;
  const edgeWarnings = (associationId: string) =>
    Array.map(Diagnostics.forAssociation(diagnostics, associationId), Diagnostics.describe);

  const maybeInspected = Array.findFirst(
    edges,
    (edge) => editor._tag === "EditingAssociation" && editor.associationId === edge.association.id,
  );

  const { pan, zoom } = document.layout.viewport;

  return h.div(
    [
      h.Id(CANVAS_ID),
      h.Role("application"),
      h.AriaLabel("Domain model canvas"),
      h.Class(`absolute inset-0 overflow-hidden bg-slate-50 select-none ${cursorFor(model)}`),
      h.Style(gridStyle(document)),
      onPress(h, Option.some(`[data-${CANVAS_ITEM_ATTRIBUTE}]`), (press) =>
        Message.PressedCanvas(press),
      ),
    ],
    [
      // Edges (SVG, world coordinates)
      h.svg(
        [
          h.Class("pointer-events-none absolute inset-0 h-full w-full overflow-visible"),
          h.AriaHidden(true),
        ],
        [
          markerDefs(h),
          h.g(
            [h.Transform(`translate(${pan.x} ${pan.y}) scale(${zoom})`)],
            [
              ...Array.map(edges, (edge) =>
                edgePath(
                  h,
                  edge,
                  isEdgeSelected(edge.association.id),
                  edgeWarnings(edge.association.id).length > 0,
                ),
              ),
              ...connectorPreview(h, document, editor, router),
            ],
          ),
        ],
      ),

      // Nodes and edge tags (HTML, world coordinates)
      h.div(
        [
          h.Class(
            "pointer-events-none absolute left-0 top-0 origin-top-left [&>*]:pointer-events-auto",
          ),
          h.Style({ transform: worldTransform(document), width: px(0), height: px(0) }),
        ],
        [
          ...Array.map(edges, (edge) =>
            edgeLabel(
              h,
              edge,
              isEdgeSelected(edge.association.id),
              edgeWarnings(edge.association.id),
            ),
          ),
          ...Array.getSomes(
            Array.map(document.entities, (entity) =>
              Option.map(Option.fromNullishOr(document.layout.nodes[entity.id]), (layout) =>
                nodeView(h, entity, layout, {
                  editor,
                  isSelected:
                    selection._tag === "SelectedEntity" && selection.entityId === entity.id,
                  diagnostics,
                  maybeEditingPropertyId,
                }),
              ),
            ),
          ),
          ...(editor._tag === "CreatingEntity"
            ? [creatingNodeView(h, editor.position, editor.draftName)]
            : []),
        ],
      ),

      // Screen-space overlays
      ...Option.match(maybeInspected, {
        onNone: () => [],
        onSome: (edge) => [inspectorView(h, document, edge, diagnostics)],
      }),

      ...(Array.isReadonlyArrayNonEmpty(document.entities) || editor._tag === "CreatingEntity"
        ? []
        : [emptyState(h)]),
    ],
  );
};

const emptyState = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("pointer-events-none absolute inset-0 flex items-center justify-center")],
    [
      h.div(
        [
          h.Class(
            "rounded-2xl border border-dashed border-slate-300 bg-white/70 px-8 py-6 text-center",
          ),
        ],
        [
          h.p([h.Class("text-sm font-semibold text-slate-700")], ["An empty domain"]),
          h.p(
            [h.Class("mt-1 text-xs text-slate-500")],
            ["Press C to create an entity, or open an existing model with ⌘O."],
          ),
        ],
      ),
    ],
  );
