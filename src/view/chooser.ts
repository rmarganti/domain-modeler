import { Array } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../message";
import type { Model, NewKind } from "../model";
import { NEW_KINDS } from "../update/chooser";

// NEW… CHOOSER
// A popover at the screen center. The backdrop covers the whole window, so a
// click anywhere outside the list cancels.

const optionView = (
  h: HtmlBuilder<Message>,
  kind: NewKind,
  index: number,
  highlighted: NewKind,
): Html => {
  const isHighlighted = kind === highlighted;
  return h.div(
    [
      h.Role("option"),
      h.AriaSelected(isHighlighted),
      h.OnClick(Message.PickedNew({ kind })),
      h.Class(
        `flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${
          isHighlighted ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"
        }`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            "inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white font-mono text-[11px] text-slate-500",
          ),
        ],
        [`${index + 1}`],
      ),
      h.span([h.Class("flex-1 font-medium")], [kind]),
    ],
  );
};

export const chooserView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const editor = model.editor;
  if (editor._tag !== "ChoosingNew") {
    return [];
  }
  return [
    h.div([h.Class("fixed inset-0 z-50"), h.OnClick(Message.ClickedCancelEdit())], []),
    h.div(
      [
        h.Role("listbox"),
        h.AriaLabel("Create new"),
        h.Class(
          "fixed left-1/2 top-1/2 z-50 flex w-56 -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur",
        ),
      ],
      [
        h.p(
          [
            h.Class(
              "px-2.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400",
            ),
          ],
          ["New…"],
        ),
        ...Array.map(NEW_KINDS, (kind, index) => optionView(h, kind, index, editor.highlighted)),
      ],
    ),
  ];
};
