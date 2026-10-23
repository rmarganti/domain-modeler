import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import * as Geometry from "../domain/geometry";
import type { NodeLayout, Point } from "../domain/schema";
import { shortcutFor } from "../keymap";
import { Message } from "../message";
import type { EditorState } from "../model";
import { canvasItem, iconButton, onPress, px, warningBadge, type PointerPress } from "./shared";

// The chrome shared by every card on the canvas (entities and enums): the
// frame, header, row actions, footer, and the placeholder shown while naming
// a new card.

const IGNORE_HEADER_PRESS = "button, input, select, [data-port]";

/** A card's position, following an in-progress drag of it. */
export const cardPosition = (nodeId: string, layout: NodeLayout, editor: EditorState): Point =>
  editor._tag === "DraggingNode" && editor.nodeId === nodeId ? editor.position : layout.position;

// FRAME

export const cardFrame = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    nodeId: string;
    dataAttribute: Readonly<{ name: string; value: string }>;
    ariaLabel: string;
    layout: NodeLayout;
    rect: Geometry.Rect;
    editor: EditorState;
    isSelected: boolean;
    hasWarnings: boolean;
  }>,
  body: ReadonlyArray<Html>,
  overlays: ReadonlyArray<Html>,
): Html => {
  const position = cardPosition(config.nodeId, config.layout, config.editor);
  const isDragging =
    config.editor._tag === "DraggingNode" && config.editor.nodeId === config.nodeId;
  const ring = config.isSelected
    ? "ring-2 ring-indigo-500"
    : config.hasWarnings
      ? "ring-2 ring-amber-300"
      : "ring-1 ring-slate-200";
  return h.keyed("div")(
    config.nodeId,
    [
      canvasItem(h),
      h.DataAttribute(config.dataAttribute.name, config.dataAttribute.value),
      h.Role("group"),
      h.AriaLabel(config.ariaLabel),
      h.Class(
        `group absolute rounded-xl bg-white transition-[width,height,box-shadow] duration-200 ease-out ${ring} ${isDragging ? "z-20 shadow-xl" : "shadow-md"}`,
      ),
      h.Style({
        left: px(position.x),
        top: px(position.y),
        width: px(config.rect.width),
        height: px(config.rect.height),
      }),
    ],
    [h.div([h.Class("h-full overflow-hidden rounded-xl")], body), ...overlays],
  );
};

// HEADER

export const cardName = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    name: string;
    isCurrent: boolean;
    maybeDescription: Option.Option<string>;
    maybeDraftName: Option.Option<string>;
    inputId: string;
    inputLabel: string;
    onInput: (name: string) => Message;
    onDoubleClick: Message;
  }>,
): Html =>
  Option.match(config.maybeDraftName, {
    onSome: (draftName) =>
      h.input([
        h.Id(config.inputId),
        ...(config.isCurrent ? [h.Attribute("aria-current", "true")] : []),
        h.Value(draftName),
        h.AriaLabel(config.inputLabel),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnInput(config.onInput),
        h.Class(
          "min-w-0 flex-1 rounded-md border border-indigo-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-900 outline-none ring-2 ring-indigo-200",
        ),
      ]),
    onNone: () =>
      h.span(
        [
          h.Class(
            `min-w-0 flex-1 truncate rounded text-sm font-semibold text-slate-900 ${config.isCurrent ? "bg-indigo-100 ring-2 ring-indigo-400" : ""}`,
          ),
          ...(config.isCurrent ? [h.Attribute("aria-current", "true")] : []),
          h.Title(Option.getOrElse(config.maybeDescription, () => "Double-click to rename")),
          h.OnDoubleClick(config.onDoubleClick),
        ],
        [config.name],
      ),
  });

export const countBadge = (h: HtmlBuilder<Message>, count: number, title: string): Html =>
  h.span(
    [
      h.Class(
        "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600",
      ),
      h.Title(title),
    ],
    [String(count)],
  );

export const cardHeader = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    nodeId: string;
    layout: NodeLayout;
    icon: Html;
    name: Html;
    warnings: ReadonlyArray<string>;
    badges: ReadonlyArray<Html>;
    onPress: (press: PointerPress) => Message;
  }>,
): Html =>
  h.div(
    [
      h.Class("flex cursor-grab items-center gap-2 px-3 active:cursor-grabbing select-none"),
      h.Style({ height: px(Geometry.NODE_HEADER_HEIGHT), touchAction: "none" }),
      onPress(h, Option.some(IGNORE_HEADER_PRESS), config.onPress),
    ],
    [
      config.icon,
      config.name,
      ...(Array.isReadonlyArrayNonEmpty(config.warnings) ? [warningBadge(h, config.warnings)] : []),
      ...config.badges,
      iconButton(h, {
        label: config.layout.isExpanded ? "Collapse" : "Expand",
        icon: chevron(h, config.layout.isExpanded),
        className: CHEVRON_BUTTON_CLASS,
        onClick: Message.ClickedToggleExpand({ nodeId: config.nodeId }),
      }),
    ],
  );

const CHEVRON_BUTTON_CLASS = "h-7 w-7";

/** Points down when expanded and right when collapsed. */
const chevron = (h: HtmlBuilder<Message>, isExpanded: boolean): Html =>
  h.svg(
    [
      h.ViewBox("0 0 24 24"),
      h.Fill("none"),
      h.Stroke("currentColor"),
      h.StrokeWidth("2.25"),
      h.StrokeLinecap("round"),
      h.StrokeLinejoin("round"),
      h.AriaHidden(true),
      h.Class("h-4 w-4"),
    ],
    [h.polyline([h.Points(isExpanded ? "6 9 12 15 18 9" : "9 6 15 12 9 18")], [])],
  );

// ROWS

/** The hover actions of a card row: reorder, edit, and delete. */
export const rowActions = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    noun: string;
    isFirst: boolean;
    isLast: boolean;
    onMoveUp: Message;
    onMoveDown: Message;
    onEdit: Message;
    onDelete: Message;
  }>,
): Html =>
  h.span(
    [h.Class("ml-auto hidden shrink-0 items-center gap-0.5 group-hover/row:flex")],
    [
      iconButton(h, {
        label: "Move up",
        icon: "↑",
        isDisabled: config.isFirst,
        onClick: config.onMoveUp,
      }),
      iconButton(h, {
        label: "Move down",
        icon: "↓",
        isDisabled: config.isLast,
        onClick: config.onMoveDown,
      }),
      iconButton(h, { label: `Edit ${config.noun}`, icon: "✎", onClick: config.onEdit }),
      iconButton(h, {
        label: `Delete ${config.noun}`,
        icon: "✕",
        className: "h-6 w-6 text-xs hover:!bg-rose-50 hover:!text-rose-600",
        onClick: config.onDelete,
      }),
    ],
  );

/** The save and cancel row at the bottom of an inline row editor. */
export const editorActions = (h: HtmlBuilder<Message>, onSave: Message): Html =>
  h.div(
    [h.Class("flex items-center justify-end gap-1.5")],
    [
      h.span(
        [h.Class("mr-auto text-[10px] text-slate-500")],
        [`${shortcutFor("commit")} to save · ${shortcutFor("escape")} to cancel`],
      ),
      h.button(
        [
          h.Type("button"),
          h.OnClick(Message.ClickedCancelEdit()),
          h.Class("rounded px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"),
        ],
        ["Cancel"],
      ),
      h.button(
        [
          h.Type("button"),
          h.OnClick(onSave),
          h.Class(
            "rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-700",
          ),
        ],
        ["Save"],
      ),
    ],
  );

// FOOTER

export const cardFooter = (
  h: HtmlBuilder<Message>,
  config: Readonly<{ addLabel: string; onAdd: Message; name: string; onDelete: Message }>,
): Html =>
  h.div(
    [
      h.Class("flex items-center justify-between border-t border-slate-100 px-2"),
      h.Style({ height: px(Geometry.NODE_FOOTER_HEIGHT) }),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.OnClick(config.onAdd),
          h.Class("rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"),
        ],
        [config.addLabel],
      ),
      iconButton(h, {
        label: `Delete ${config.name}`,
        icon: "🗑",
        className: "h-7 w-7 text-xs hover:!bg-rose-50 hover:!text-rose-600",
        onClick: config.onDelete,
      }),
    ],
  );

// CREATING

/** The placeholder card shown while naming a new card. */
export const creatingCardView = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    position: Point;
    draftName: string;
    icon: Html;
    inputId: string;
    inputLabel: string;
    placeholder: string;
    onInput: (name: string) => Message;
  }>,
): Html =>
  h.div(
    [
      canvasItem(h),
      h.Class(
        "absolute flex items-center gap-2 rounded-xl bg-white px-3 shadow-lg ring-2 ring-indigo-400",
      ),
      h.Style({
        left: px(config.position.x),
        top: px(config.position.y),
        width: px(Geometry.NODE_WIDTH),
        height: px(Geometry.NODE_HEADER_HEIGHT),
      }),
    ],
    [
      config.icon,
      h.input([
        h.Id(config.inputId),
        h.Value(config.draftName),
        h.AriaLabel(config.inputLabel),
        h.Placeholder(config.placeholder),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnInput(config.onInput),
        h.Class("min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"),
      ]),
    ],
  );
