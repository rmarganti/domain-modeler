import type { Html, HtmlBuilder } from "foldkit/html";

import {
  HELP_CLOSE,
  HELP_NOTES,
  HELP_SECTIONS,
  helpChips,
  shortcutFor,
  shortcutTitle,
  type HelpItem,
} from "../keymap";
import { Message } from "../message";
import type { Model } from "../model";
import { kbd } from "./shared";

/** Alternatives separated by a muted "or"; chips within one alternative sit together. */
const keysView = (h: HtmlBuilder<Message>, item: HelpItem): Html =>
  h.span(
    [h.Class("flex shrink-0 items-center gap-1")],
    helpChips(item).flatMap((chips, index) => [
      ...(index === 0 ? [] : [h.span([h.Class("text-[11px] text-slate-400")], ["or"])]),
      ...chips.map((chip) => kbd(h, chip)),
    ]),
  );

const rowView = (h: HtmlBuilder<Message>, item: HelpItem): Html =>
  h.li(
    [h.Class("flex items-center justify-between gap-3 py-0.5 text-xs")],
    [
      h.span([h.Class("text-slate-600")], [item.label]),
      item.gesture === undefined
        ? keysView(h, item)
        : h.span([h.Class("shrink-0 text-slate-400")], [item.gesture]),
    ],
  );

const sectionView = (h: HtmlBuilder<Message>, section: (typeof HELP_SECTIONS)[number]): Html =>
  h.section(
    [h.AriaLabel(section.title)],
    [
      h.h3(
        [h.Class("mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400")],
        [section.title],
      ),
      ...section.groups.map((group) =>
        h.ul(
          [
            h.Class(
              "border-slate-100 [&:not(:first-of-type)]:mt-1.5 [&:not(:first-of-type)]:border-t [&:not(:first-of-type)]:pt-1.5",
            ),
          ],
          group.map((item) => rowView(h, item)),
        ),
      ),
    ],
  );

const noteItemView = (h: HtmlBuilder<Message>, item: HelpItem): Html =>
  h.li(
    [h.Class("flex items-center gap-1.5")],
    item.ids === undefined ? [item.label] : [keysView(h, item), item.label],
  );

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
              "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl outline-none",
            ),
          ],
          [
            h.div(
              [h.Class("mb-1 flex items-center justify-between gap-4")],
              [
                h.h2([h.Class("text-lg font-semibold")], ["Keyboard shortcuts"]),
                h.div(
                  [h.Class("flex items-center gap-3 text-xs text-slate-400")],
                  [
                    noteItemView(h, HELP_CLOSE),
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
              ],
            ),
            h.p(
              [h.Class("mb-5 text-xs text-slate-500")],
              [
                "Select a card, move its row cursor, then act on the current row. ",
                kbd(h, shortcutFor("escape")),
                " always backs out one step.",
              ],
            ),
            h.div(
              [h.Class("grid gap-x-8 gap-y-5 sm:grid-cols-2 md:grid-cols-3")],
              ([0, 1, 2] as const).map((column) =>
                h.div(
                  [
                    h.Class(
                      // At two columns the last column spans both, its sections side by side.
                      column === 2
                        ? "space-y-5 sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:space-y-0 md:col-span-1 md:block md:space-y-5"
                        : "space-y-5",
                    ),
                  ],
                  HELP_SECTIONS.filter((section) => section.column === column).map((section) =>
                    sectionView(h, section),
                  ),
                ),
              ),
            ),
            h.div(
              [h.Class("mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-500")],
              HELP_NOTES.map((note) =>
                h.section(
                  [h.AriaLabel(note.title), h.Class("flex flex-wrap items-center gap-x-4 gap-y-1")],
                  [
                    h.h3([h.Class("w-24 font-semibold text-slate-700")], [note.title]),
                    h.ul(
                      [h.Class("contents")],
                      note.items.map((item) => noteItemView(h, item)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ];
