import { Array } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { KEYMAP, KEY_CONTEXTS, formatKeys, keysFor, shortcutTitle, type KeyMode } from "../keymap";
import { Message } from "../message";
import type { Model } from "../model";

const contextView = (h: HtmlBuilder<Message>, mode: KeyMode, label: string): Html => {
  const entries = KEYMAP.filter((entry) => entry.modes.includes(mode));
  const groups = Array.dedupe(entries.map((entry) => entry.group));
  return h.section(
    [h.AriaLabel(label), h.Class("min-w-0")],
    [
      h.h3([h.Class("mb-3 text-base font-semibold text-slate-900")], [label]),
      ...groups.map((group) =>
        h.div(
          [h.Class("mb-4")],
          [
            h.h4(
              [h.Class("mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400")],
              [group],
            ),
            h.ul(
              [h.Class("space-y-1.5")],
              entries
                .filter((entry) => entry.group === group)
                .map((entry) =>
                  h.li(
                    [h.Class("flex items-start justify-between gap-3 text-xs")],
                    [
                      h.span([h.Class("text-slate-600")], [entry.description]),
                      h.kbd(
                        [
                          h.Class(
                            "shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800",
                          ),
                        ],
                        [formatKeys(entry.displayKeys ?? keysFor(entry))],
                      ),
                    ],
                  ),
                ),
            ),
          ],
        ),
      ),
    ],
  );
};

export const shortcutsView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  model.editor._tag !== "ViewingShortcuts"
    ? []
    : [
        h.div(
          [h.Class("fixed inset-0 z-50 bg-slate-900/20"), h.OnClick(Message.ClickedCancelEdit())],
          [],
        ),
        h.div(
          [
            h.Id("keyboard-shortcuts"),
            h.Role("dialog"),
            h.AriaLabel("Keyboard shortcuts"),
            h.AriaModal(true),
            h.Tabindex(-1),
            h.Class(
              "fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl outline-none",
            ),
          ],
          [
            h.div(
              [h.Class("mb-6 flex items-center justify-between gap-4")],
              [
                h.h2([h.Class("text-lg font-semibold")], ["Keyboard shortcuts"]),
                h.button(
                  [
                    h.Type("button"),
                    h.AriaLabel("Close keyboard shortcuts"),
                    h.Title(shortcutTitle("Close keyboard shortcuts", "escape")),
                    h.OnClick(Message.ClickedCancelEdit()),
                    h.Class(
                      "rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    ),
                  ],
                  ["✕"],
                ),
              ],
            ),
            h.div(
              [h.Class("grid gap-x-8 gap-y-4 sm:grid-cols-2")],
              KEY_CONTEXTS.map(({ mode, label }) => contextView(h, mode, label)),
            ),
          ],
        ),
      ];
