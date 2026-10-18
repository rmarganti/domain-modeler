import type { Html, HtmlBuilder } from "foldkit/html";

import { CARD_QUERY_INPUT_ID } from "../dom";
import { searchCards, type CardMatch } from "../domain/card-search";
import { shortcutFor } from "../keymap";
import { Message } from "../message";
import type { Model } from "../model";

const optionId = (index: number): string => `card-option-${index}`;

const optionView = (
  h: HtmlBuilder<Message>,
  match: CardMatch,
  index: number,
  highlighted: number,
): Html =>
  h.div(
    [
      h.Id(optionId(index)),
      h.Role("option"),
      h.AriaSelected(index === highlighted),
      h.OnClick(Message.PickedCard({ nodeId: match.card.nodeId })),
      h.Class(
        `flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
          index === highlighted
            ? "bg-indigo-50 text-indigo-900"
            : "text-slate-700 hover:bg-slate-50"
        }`,
      ),
    ],
    [
      h.span(
        [h.Class("min-w-0 break-words font-medium")],
        match.card.name
          .split("")
          .map((character, characterIndex) =>
            match.indices.includes(characterIndex)
              ? h.mark([h.Class("rounded-sm bg-indigo-200 text-inherit")], [character])
              : character,
          ),
      ),
      h.span([h.Class("shrink-0 text-xs text-slate-400")], [match.card.kind]),
    ],
  );

export const pickerView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const editor = model.editor;
  if (editor._tag !== "PickingCard") {
    return [];
  }
  const matches = searchCards(model.history.present, editor.query);
  return [
    h.div(
      [h.Class("fixed inset-0 z-50 bg-slate-900/10"), h.OnClick(Message.ClickedCancelEdit())],
      [],
    ),
    h.div(
      [
        h.Role("dialog"),
        h.AriaLabel("Find card"),
        h.AriaModal(true),
        h.Class(
          "fixed left-1/2 top-[15vh] z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur",
        ),
      ],
      [
        h.input([
          h.Id(CARD_QUERY_INPUT_ID),
          h.Role("combobox"),
          h.AriaLabel("Find card"),
          h.AriaAutocomplete("list"),
          h.AriaExpanded(true),
          h.AriaControls("card-options"),
          ...(matches[editor.highlighted] === undefined
            ? []
            : [h.AriaActiveDescendant(optionId(editor.highlighted))]),
          h.Type("text"),
          h.Autocomplete("off"),
          h.Placeholder("Find an entity or enum…"),
          h.Value(editor.query),
          h.OnInput((query) => Message.UpdatedCardQuery({ query })),
          h.Class(
            "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200",
          ),
        ]),
        h.div(
          [
            h.Id("card-options"),
            h.Role("listbox"),
            h.AriaLabel("Cards"),
            h.Class("mt-2 max-h-[50vh] space-y-1 overflow-y-auto"),
          ],
          matches.map((match, index) => optionView(h, match, index, editor.highlighted)),
        ),
        ...(matches.length === 0
          ? [
              h.p(
                [h.Role("status"), h.Class("px-3 py-6 text-center text-sm text-slate-500")],
                ["No cards match"],
              ),
            ]
          : []),
        h.p(
          [h.Class("px-3 pb-1 pt-2 text-[11px] text-slate-400")],
          [
            `${shortcutFor("pickNext")} / ${shortcutFor("pickPrevious")} choose · ${shortcutFor("pickCard")} focus · ${shortcutFor("escape")} cancel`,
          ],
        ),
      ],
    ),
  ];
};
