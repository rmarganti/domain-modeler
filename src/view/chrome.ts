import { Array, Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import * as Diagnostics from "../domain/diagnostics";
import * as History from "../domain/history";
import { shortcutTitle } from "../keymap";
import { Message } from "../message";
import { EditorState, PickerPurpose, isDirty, maybeFileName, type Model } from "../model";

// HUD

const hudButton = (
  h: HtmlBuilder<Message>,
  label: string,
  content: string,
  onClick: Message,
  shortcutId: string,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.AriaLabel(label),
      h.Title(shortcutTitle(label, shortcutId)),
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
      hudButton(h, "Zoom out", "−", Message.RequestedZoomOut(), "zoomOut"),
      h.span(
        [
          h.Class("w-12 text-center text-xs font-semibold tabular-nums text-slate-700"),
          h.AriaLive("polite"),
        ],
        [`${Math.round(zoom * 100)}%`],
      ),
      hudButton(h, "Zoom in", "+", Message.RequestedZoomIn(), "zoomIn"),
      h.span([h.Class("mx-1 h-4 w-px bg-slate-200")], []),
      hudButton(h, "Reset view to 100%", "100%", Message.RequestedResetView(), "resetView"),
      hudButton(h, "Fit to screen", "Fit", Message.RequestedFitToScreen(), "fitToScreen"),
      h.span([h.Class("mx-1 h-4 w-px bg-slate-200")], []),
      hudButton(h, "Auto-arrange cards", "Arrange", Message.RequestedAutoArrange(), "autoArrange"),
    ],
  );
};

// STATUS

type StatusPill = Readonly<{ label: string; className: string }>;

const pickingPill = (label: string, className: string): StatusPill => ({ label, className });

export const statusPill = (editor: EditorState): StatusPill =>
  EditorState.match<StatusPill>(editor, {
    Idle: () => ({
      label: "NORMAL",
      className: "bg-slate-800 text-white",
    }),
    Picking: ({ purpose }) =>
      PickerPurpose.match(purpose, {
        Focus: () => pickingPill("FIND", "bg-indigo-600 text-white"),
        Connect: () => pickingPill("CONNECT", "bg-violet-600 text-white"),
        RunCommand: () => pickingPill("COMMAND", "bg-slate-800 text-white"),
      }),
    ViewingShortcuts: () => ({
      label: "HELP",
      className: "bg-slate-800 text-white",
    }),
    ChoosingNew: () => ({
      label: "NEW",
      className: "bg-emerald-600 text-white",
    }),
    CreatingEntity: () => ({
      label: "CREATING",
      className: "bg-emerald-600 text-white",
    }),
    RenamingEntity: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
    }),
    EditingAttribute: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
    }),
    CreatingEnum: () => ({
      label: "CREATING",
      className: "bg-emerald-600 text-white",
    }),
    RenamingEnum: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
    }),
    EditingEnumValue: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
    }),
    EditingAssociation: () => ({
      label: "EDITING",
      className: "bg-indigo-600 text-white",
    }),
    ConnectingAssociation: () => ({
      label: "CONNECTING",
      className: "bg-violet-600 text-white",
    }),
    DraggingNode: () => ({
      label: "MOVING",
      className: "bg-sky-600 text-white",
    }),
    PanningCanvas: () => ({
      label: "PANNING",
      className: "bg-sky-600 text-white",
    }),
  });

// TOOLBAR

const toolbarButton = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    label: string;
    content: string;
    shortcutId?: string;
    onClick: Message;
    isDisabled?: boolean;
  }>,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.AriaLabel(config.label),
      h.Title(
        config.shortcutId === undefined
          ? config.label
          : shortcutTitle(config.label, config.shortcutId),
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
  const fileLabel = Option.getOrElse(maybeFileName(model), () => "Not saved to a file");
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
        shortcutId: "newDocument",
        onClick: Message.RequestedNewDocument(),
      }),
      toolbarButton(h, {
        label: "Open",
        content: "Open",
        shortcutId: "open",
        onClick: Message.RequestedOpen(),
      }),
      toolbarButton(h, {
        label: "Save",
        content: "Save",
        shortcutId: "save",
        onClick: Message.RequestedSave(),
      }),
      toolbarButton(h, {
        label: "Save as",
        content: "Save As…",
        shortcutId: "saveAs",
        onClick: Message.RequestedSaveAs(),
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
              h.Class(`h-2 w-2 rounded-full ${isDirty(model) ? "bg-amber-400" : "bg-emerald-400"}`),
              h.Title(isDirty(model) ? "Unsaved changes" : "All changes saved"),
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
        shortcutId: "undo",
        isDisabled: !History.canUndo(model.history),
        onClick: Message.RequestedUndo(),
      }),
      toolbarButton(h, {
        label: "Redo",
        content: "↷ Redo",
        shortcutId: "redo",
        isDisabled: !History.canRedo(model.history),
        onClick: Message.RequestedRedo(),
      }),
      divider(h),
      h.button(
        [
          h.Type("button"),
          h.Title(shortcutTitle("Create entity", "create")),
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
          h.Title(shortcutTitle("Create enum", "create")),
          h.OnClick(Message.ClickedAddEnum()),
          h.Class(
            "rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700",
          ),
        ],
        ["+ Enum"],
      ),
      toolbarButton(h, {
        label: "Keyboard shortcuts",
        content: "?",
        shortcutId: "shortcuts",
        onClick: Message.ClickedShowShortcuts(),
      }),
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
