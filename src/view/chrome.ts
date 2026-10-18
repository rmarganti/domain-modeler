import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import * as Diagnostics from "../domain/diagnostics";
import * as History from "../domain/history";
import { Message } from "../message";
import { EditorState, type Model } from "../model";

// HUD

const hudButton = (
  h: HtmlBuilder<Message>,
  label: string,
  content: string,
  onClick: Message,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.AriaLabel(label),
      h.Title(label),
      h.OnClick(onClick),
      h.Class(
        "rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      ),
    ],
    [content],
  );

export const hudView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const zoom = model.history.present.layout.viewport.zoom;
  return h.div(
    [
      h.Role("toolbar"),
      h.AriaLabel("View controls"),
      h.Class(
        "absolute right-4 top-4 z-40 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-md backdrop-blur",
      ),
    ],
    [
      hudButton(h, "Zoom out", "−", Message.ClickedZoomOut()),
      h.span(
        [
          h.Class("w-12 text-center text-xs font-semibold tabular-nums text-slate-700"),
          h.AriaLive("polite"),
        ],
        [`${Math.round(zoom * 100)}%`],
      ),
      hudButton(h, "Zoom in", "+", Message.ClickedZoomIn()),
      h.span([h.Class("mx-1 h-4 w-px bg-slate-200")], []),
      hudButton(h, "Reset view to 100%", "100%", Message.ClickedResetView()),
      hudButton(h, "Fit to screen", "Fit", Message.ClickedFitToScreen()),
    ],
  );
};

// STATUS

type StatusPill = Readonly<{ label: string; className: string; hint: string }>;

export const statusPill = (editor: EditorState): StatusPill =>
  EditorState.match<StatusPill>(editor, {
    Idle: () => ({
      label: "NORMAL",
      className: "bg-slate-800 text-white",
      hint: "c create · d delete · i edit · u undo · ⌃r redo · space+drag pan",
    }),
    CreatingEntity: () => ({
      label: "CREATING",
      className: "bg-emerald-600 text-white",
      hint: "Enter create · Esc cancel",
    }),
    RenamingEntity: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
      hint: "Enter commit · Esc cancel",
    }),
    EditingAttribute: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
      hint: "Enter commit · Esc cancel",
    }),
    CreatingEnum: () => ({
      label: "CREATING",
      className: "bg-emerald-600 text-white",
      hint: "Enter create · Esc cancel",
    }),
    RenamingEnum: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
      hint: "Enter commit · Esc cancel",
    }),
    EditingEnumValue: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
      hint: "Enter commit · Esc cancel",
    }),
    EditingAssociation: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
      hint: "Delete remove edge · Esc close",
    }),
    ConnectingAssociation: () => ({
      label: "CONNECTING",
      className: "bg-violet-600 text-white",
      hint: "Release on an entity to connect · Esc cancel",
    }),
    DraggingNode: () => ({
      label: "MOVING",
      className: "bg-sky-600 text-white",
      hint: "Release to place",
    }),
    PanningCanvas: () => ({
      label: "PANNING",
      className: "bg-sky-600 text-white",
      hint: "Release to stop",
    }),
  });

// TOOLBAR

const toolbarButton = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    label: string;
    content: string;
    shortcut?: string;
    onClick: Message;
    isDisabled?: boolean;
  }>,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.AriaLabel(config.label),
      h.Title(
        config.shortcut === undefined ? config.label : `${config.label} (${config.shortcut})`,
      ),
      h.Disabled(config.isDisabled ?? false),
      h.OnClick(config.onClick),
      h.Class(
        "rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent",
      ),
    ],
    [config.content],
  );

const divider = (h: HtmlBuilder<Message>): Html =>
  h.span([h.Class("mx-1 h-5 w-px bg-slate-200")], []);

export const toolbarView = (
  model: Model,
  diagnostics: ReadonlyArray<Diagnostics.Diagnostic>,
  h: HtmlBuilder<Message>,
): Html => {
  const document = model.history.present;
  const pill = statusPill(model.editor);
  const fileLabel = Option.getOrElse(model.maybeFileName, () => "Not saved to a file");
  const diagnosticMessages = Array.map(diagnostics, Diagnostics.describe);

  return h.footer(
    [
      h.Class(
        "absolute inset-x-0 bottom-0 z-40 flex h-12 items-center gap-1 border-t border-slate-200 bg-white/95 px-3 text-xs backdrop-blur",
      ),
    ],
    [
      toolbarButton(h, {
        label: "New model",
        content: "New",
        onClick: Message.ClickedNewDocument(),
      }),
      toolbarButton(h, {
        label: "Open",
        content: "Open",
        shortcut: "⌘O",
        onClick: Message.ClickedOpen(),
      }),
      toolbarButton(h, {
        label: "Save",
        content: "Save",
        shortcut: "⌘S",
        onClick: Message.ClickedSave(),
      }),
      toolbarButton(h, {
        label: "Save as",
        content: "Save As…",
        shortcut: "⌘⇧S",
        onClick: Message.ClickedSaveAs(),
      }),
      divider(h),
      h.input([
        h.Value(document.name),
        h.AriaLabel("Model name"),
        h.Autocomplete("off"),
        h.Spellcheck(false),
        h.OnChange((name) => Message.ChangedDocumentName({ name })),
        h.Class(
          "w-40 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-slate-800 outline-none hover:border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
        ),
      ]),
      h.span(
        [h.Class("flex items-center gap-1.5 truncate text-slate-500"), h.Title(fileLabel)],
        [
          h.span(
            [
              h.Class(
                `h-2 w-2 rounded-full ${model.saveStatus === "Dirty" ? "bg-amber-400" : "bg-emerald-400"}`,
              ),
              h.Title(model.saveStatus === "Dirty" ? "Unsaved changes" : "All changes saved"),
            ],
            [],
          ),
          fileLabel,
        ],
      ),
      divider(h),
      toolbarButton(h, {
        label: "Undo",
        content: "↶ Undo",
        shortcut: "u / ⌘Z",
        isDisabled: !History.canUndo(model.history),
        onClick: Message.ClickedUndo(),
      }),
      toolbarButton(h, {
        label: "Redo",
        content: "↷ Redo",
        shortcut: "⌃r / ⌘⇧Z",
        isDisabled: !History.canRedo(model.history),
        onClick: Message.ClickedRedo(),
      }),
      divider(h),
      h.button(
        [
          h.Type("button"),
          h.Title("Create entity (c)"),
          h.OnClick(Message.ClickedAddEntity()),
          h.Class(
            "rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700",
          ),
        ],
        ["+ Entity"],
      ),
      h.button(
        [
          h.Type("button"),
          h.AriaLabel("Create enum"),
          h.Title("Create enum"),
          h.OnClick(Message.ClickedAddEnum()),
          h.Class(
            "rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700",
          ),
        ],
        ["+ Enum"],
      ),
      h.div(
        [h.Class("ml-auto flex min-w-0 items-center gap-3")],
        [
          ...(diagnosticMessages.length > 0
            ? [
                h.span(
                  [
                    h.Class("rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"),
                    h.Title(diagnosticMessages.join("\n")),
                  ],
                  [
                    `⚠ ${diagnosticMessages.length} warning${diagnosticMessages.length === 1 ? "" : "s"}`,
                  ],
                ),
              ]
            : []),
          h.span([h.Class("hidden truncate text-slate-400 lg:inline")], [pill.hint]),
          h.span(
            [
              h.Class(
                `rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider ${pill.className}`,
              ),
              h.AriaLive("polite"),
              h.AriaLabel(`Mode: ${pill.label}`),
            ],
            [pill.label],
          ),
        ],
      ),
    ],
  );
};

// NOTICE

export const noticeView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(model.maybeNotice, {
    onNone: () => [],
    onSome: (notice) => [
      h.div(
        [
          h.Role(notice.tone === "Error" ? "alert" : "status"),
          h.Class(
            `absolute left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2 text-sm shadow-lg ${
              notice.tone === "Error" ? "bg-rose-600 text-white" : "bg-slate-900 text-white"
            }`,
          ),
        ],
        [
          notice.text,
          h.button(
            [
              h.Type("button"),
              h.AriaLabel("Dismiss"),
              h.OnClick(Message.ClickedDismissNotice()),
              h.Class("rounded px-1 opacity-70 hover:opacity-100"),
            ],
            ["✕"],
          ),
        ],
      ),
    ],
  });
