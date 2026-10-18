import { Array, Option, pipe } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import * as Diagnostics from "../domain/diagnostics";
import * as Doc from "../domain/document";
import type { EdgeRouter } from "../domain/edgeRouter";
import * as Geometry from "../domain/geometry";
import { MULTIPLICITIES, multiplicityEquals, multiplicityLabel } from "../domain/multiplicity";
import { defaultRole } from "../domain/naming";
import type {
  AssociationDefinition,
  DomainModelDocument,
  EndIndex,
  EntityDefinition,
  NodeLayout,
  Point,
} from "../domain/schema";
import { Message } from "../message";
import type { EditorState } from "../model";
import { canvasItem, iconButton, px, warningBadge } from "./shared";

// GEOMETRY

export type EdgeGeometry = Readonly<{
  association: AssociationDefinition;
  source: Point;
  target: Point;
  sourceSide: Geometry.Side;
  targetSide: Geometry.Side;
  path: string;
  midpoint: Point;
}>;

type PlacedEntity = Readonly<{ entity: EntityDefinition; layout: NodeLayout }>;

/** Applies an in-progress drag so edges follow the node being moved. */
const effectiveLayout = (entityId: string, layout: NodeLayout, editor: EditorState): NodeLayout =>
  editor._tag === "DraggingNode" && editor.entityId === entityId
    ? { ...layout, position: editor.position }
    : layout;

const placeEntity = (
  document: DomainModelDocument,
  entityId: string,
  editor: EditorState,
): Option.Option<PlacedEntity> =>
  Option.all({
    entity: Doc.findEntity(document, entityId),
    layout: Option.map(Doc.findNode(document, entityId), (layout) =>
      effectiveLayout(entityId, layout, editor),
    ),
  });

const maybeEditingAttributeId = (editor: EditorState): Option.Option<string> =>
  editor._tag === "EditingAttribute" ? Option.some(editor.attributeId) : Option.none();

/** Edge endpoints, path, and midpoint, or none when either end is dangling. */
export const edgeGeometry = (
  document: DomainModelDocument,
  association: AssociationDefinition,
  editor: EditorState,
  router: EdgeRouter,
): Option.Option<EdgeGeometry> => {
  const [from, to] = association.ends;
  const isSelfReference = from.entityId === to.entityId;
  return Option.map(
    Option.all([
      placeEntity(document, from.entityId, editor),
      placeEntity(document, to.entityId, editor),
    ]),
    ([source, target]) => {
      const editing = maybeEditingAttributeId(editor);
      const sourceRect = Geometry.nodeRect(source.entity, source.layout, editing);
      const targetRect = Geometry.nodeRect(target.entity, target.layout, editing);
      const { sourceSide, targetSide } = Geometry.chooseSides(
        sourceRect,
        targetRect,
        isSelfReference,
      );
      const sourceOffset = Geometry.HEADER_ANCHOR_OFFSET;
      // NOTE: a self reference would start and end on the same point; drop
      // the return leg lower so the loop reads.
      const targetOffset = isSelfReference
        ? Math.min(sourceOffset + 24, targetRect.height - 8)
        : Geometry.HEADER_ANCHOR_OFFSET;
      const sourcePoint = Geometry.anchorPoint(sourceRect, sourceOffset, sourceSide);
      const targetPoint = Geometry.anchorPoint(targetRect, targetOffset, targetSide);
      return {
        association,
        source: sourcePoint,
        target: targetPoint,
        sourceSide,
        targetSide,
        path: router.computePath(sourcePoint, targetPoint, sourceSide, targetSide),
        midpoint: router.computeMidpoint(sourcePoint, targetPoint),
      };
    },
  );
};

// SVG LAYER

const MARKERS = [
  { id: "arrow", color: "#94a3b8" },
  { id: "arrow-selected", color: "#4f46e5" },
  { id: "arrow-warning", color: "#d97706" },
] as const;

export const markerDefs = (h: HtmlBuilder<Message>): Html =>
  h.defs(
    [],
    Array.map(MARKERS, ({ id, color }) =>
      h.marker(
        [
          h.Id(id),
          h.ViewBox("0 0 10 10"),
          h.RefX("9"),
          h.RefY("5"),
          h.MarkerWidth("7"),
          h.MarkerHeight("7"),
          h.Orient("auto-start-reverse"),
        ],
        [h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill(color)], [])],
      ),
    ),
  );

export const edgePath = (
  h: HtmlBuilder<Message>,
  geometry: EdgeGeometry,
  isSelected: boolean,
  hasWarnings: boolean,
): Html => {
  const [stroke, marker] = isSelected
    ? ["#4f46e5", "arrow-selected"]
    : hasWarnings
      ? ["#d97706", "arrow-warning"]
      : ["#94a3b8", "arrow"];
  const associationId = geometry.association.id;
  return h.keyed("g")(
    associationId,
    [],
    [
      h.path(
        [
          canvasItem(h),
          h.D(geometry.path),
          h.Fill("none"),
          h.Stroke("transparent"),
          h.StrokeWidth("14"),
          h.PointerEvents("stroke"),
          h.Cursor("pointer"),
          h.OnClick(Message.ClickedEdge({ associationId })),
        ],
        [],
      ),
      h.path(
        [
          h.D(geometry.path),
          h.Fill("none"),
          h.Stroke(stroke),
          h.StrokeWidth(isSelected ? "2.5" : "2"),
          ...(hasWarnings && !isSelected ? [h.StrokeDasharray("6 4")] : []),
          h.MarkerEnd(`url(#${marker})`),
          h.PointerEvents("none"),
        ],
        [],
      ),
    ],
  );
};

export const connectorPreview = (
  h: HtmlBuilder<Message>,
  document: DomainModelDocument,
  editor: EditorState,
  router: EdgeRouter,
): ReadonlyArray<Html> => {
  if (editor._tag !== "ConnectingAssociation") {
    return [];
  }
  return pipe(
    placeEntity(document, editor.fromEntityId, editor),
    Option.match({
      onNone: () => [],
      onSome: ({ entity, layout }) => {
        const rect = Geometry.nodeRect(entity, layout, Option.none());
        const side: Geometry.Side =
          editor.currentPos.x >= rect.x + rect.width / 2 ? "right" : "left";
        const start = Geometry.anchorPoint(rect, Geometry.HEADER_ANCHOR_OFFSET, side);
        const end = editor.currentPos;
        const endSide: Geometry.Side = side === "right" ? "left" : "right";
        return [
          h.path(
            [
              h.D(router.computePath(start, end, side, endSide)),
              h.Fill("none"),
              h.Stroke("#6366f1"),
              h.StrokeWidth("2"),
              h.StrokeDasharray("6 4"),
              h.MarkerEnd("url(#arrow-selected)"),
              h.PointerEvents("none"),
            ],
            [],
          ),
          h.circle([h.Cx(String(end.x)), h.Cy(String(end.y)), h.R("4"), h.Fill("#6366f1")], []),
        ];
      },
    }),
  );
};

// MIDPOINT TAGS

const endLabels = (association: AssociationDefinition): readonly [string, string] => [
  multiplicityLabel(association.ends[0].multiplicity),
  multiplicityLabel(association.ends[1].multiplicity),
];

export const multiplicityTag = (association: AssociationDefinition): string => {
  const [label0, label1] = endLabels(association);
  return `${label0} ── ${label1}`;
};

export const edgeLabel = (
  h: HtmlBuilder<Message>,
  geometry: EdgeGeometry,
  isSelected: boolean,
  warnings: ReadonlyArray<string>,
): Html => {
  const association = geometry.association;
  const [label0, label1] = endLabels(association);
  return h.keyed("button")(
    association.id,
    [
      canvasItem(h),
      h.Type("button"),
      h.AriaLabel(
        `Relationship ${association.name ?? ""} ${label0}:${label1}`.replace(/\s+/g, " "),
      ),
      h.OnClick(Message.ClickedEdge({ associationId: association.id })),
      h.Class(
        `absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] shadow-sm transition ${
          isSelected
            ? "border-indigo-500 bg-indigo-600 text-white"
            : warnings.length > 0
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
              : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
        }`,
      ),
      h.Style({ left: px(geometry.midpoint.x), top: px(geometry.midpoint.y) }),
    ],
    [
      ...(association.name !== undefined
        ? [h.span([h.Class("font-sans font-medium")], [association.name])]
        : []),
      h.span([], [multiplicityTag(association)]),
      ...(warnings.length > 0 && !isSelected
        ? [h.span([h.Title(warnings.join("\n"))], ["⚠"])]
        : []),
    ],
  );
};

// INSPECTOR

const INPUT_CLASS =
  "rounded-md border border-slate-300 px-2 py-1 text-xs outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const entityName = (document: DomainModelDocument, entityId: string): string =>
  Option.match(Doc.findEntity(document, entityId), {
    onNone: () => "?",
    onSome: (entity) => entity.name,
  });

/** One end's role and multiplicity. A self association names both ends after
 *  the same entity, so their labels carry the end number to stay unique. */
const endSection = (
  h: HtmlBuilder<Message>,
  document: DomainModelDocument,
  association: AssociationDefinition,
  endIndex: EndIndex,
): Html => {
  const associationId = association.id;
  const end = association.ends[endIndex];
  const name = entityName(document, end.entityId);
  const isSelfReference = association.ends[0].entityId === association.ends[1].entityId;
  const at = isSelfReference ? `at ${name} (end ${endIndex + 1})` : `at ${name}`;
  return h.section(
    [h.Class("flex flex-col gap-1")],
    [
      h.h3([h.Class("truncate text-[11px] font-semibold text-slate-600")], [name]),
      h.input([
        h.Value(end.role ?? ""),
        h.AriaLabel(`Role ${at}`),
        h.Placeholder(defaultRole(name, end.multiplicity)),
        h.Autocomplete("off"),
        h.OnChange((role) => Message.ChangedEndRole({ associationId, endIndex, role })),
        h.Class(`${INPUT_CLASS} font-mono`),
      ]),
      h.div(
        [
          h.Role("radiogroup"),
          h.AriaLabel(`Multiplicity ${at}`),
          h.Class("grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1"),
        ],
        Array.map(MULTIPLICITIES, ({ multiplicity, label }) => {
          const isChecked = multiplicityEquals(multiplicity, end.multiplicity);
          return h.button(
            [
              h.Type("button"),
              h.Role("radio"),
              h.AriaChecked(isChecked),
              h.OnClick(Message.SelectedEndMultiplicity({ associationId, endIndex, multiplicity })),
              h.Class(
                `rounded-md py-1 font-mono text-xs transition ${
                  isChecked
                    ? "bg-white font-semibold text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`,
              ),
            ],
            [label],
          );
        }),
      ),
    ],
  );
};

export const inspectorView = (
  h: HtmlBuilder<Message>,
  document: DomainModelDocument,
  geometry: EdgeGeometry,
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>,
): Html => {
  const association = geometry.association;
  const associationId = association.id;
  const screen = Geometry.worldToScreen(document.layout.viewport, geometry.midpoint);
  const warnings = Array.map(
    Diagnostics.forAssociation(diagnostics, associationId),
    Diagnostics.describe,
  );

  return h.div(
    [
      canvasItem(h),
      h.Role("dialog"),
      h.AriaLabel("Relationship inspector"),
      h.Class(
        "pointer-events-auto absolute z-30 flex w-80 -translate-x-1/2 flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur",
      ),
      h.Style({ left: px(screen.x), top: px(screen.y + 22) }),
    ],
    [
      h.div(
        [h.Class("flex items-center gap-2")],
        [
          h.span(
            [h.Class("min-w-0 flex-1 truncate text-xs font-semibold text-slate-700")],
            [
              `${entityName(document, association.ends[0].entityId)} ── ${entityName(document, association.ends[1].entityId)}`,
            ],
          ),
          ...(warnings.length > 0 ? [warningBadge(h, warnings)] : []),
          iconButton(h, {
            label: "Delete relationship",
            icon: "🗑",
            className: "h-6 w-6 text-xs hover:!bg-rose-50 hover:!text-rose-600",
            onClick: Message.ClickedDeleteAssociation({ associationId }),
          }),
          iconButton(h, { label: "Close", icon: "✕", onClick: Message.ClickedCloseInspector() }),
        ],
      ),
      h.input([
        h.Value(association.name ?? ""),
        h.AriaLabel("Relationship name"),
        h.Placeholder("Relationship name (optional)"),
        h.Autocomplete("off"),
        h.OnChange((name) => Message.ChangedAssociationName({ associationId, name })),
        h.Class(INPUT_CLASS),
      ]),
      h.textarea([
        h.Value(association.description ?? ""),
        h.AriaLabel("Relationship description"),
        h.Placeholder("Description (optional)"),
        h.Rows(2),
        h.OnChange((description) =>
          Message.ChangedAssociationDescription({ associationId, description }),
        ),
        h.Class(`${INPUT_CLASS} resize-none`),
      ]),
      h.div(
        [h.Class("flex flex-col gap-2")],
        [endSection(h, document, association, 0), endSection(h, document, association, 1)],
      ),
      ...(warnings.length > 0
        ? [
            h.ul(
              [h.Class("rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800")],
              Array.map(warnings, (warning) => h.li([], [`⚠ ${warning}`])),
            ),
          ]
        : []),
      h.p([h.Class("text-[10px] text-slate-400")], ["Delete / Backspace removes · Esc closes"]),
    ],
  );
};
