import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { CANVAS_ITEM_ATTRIBUTE } from "../dom";
import type { Message } from "../message";

export type PointerPress = Readonly<{ button: number; clientX: number; clientY: number }>;

const isInside = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

/** Builds an `OnPointerDown` that ignores presses originating inside any
 *  element matching `maybeIgnoreSelector`, so nested controls keep their own
 *  pointer behavior. */
export const onPress = (
  h: HtmlBuilder<Message>,
  maybeIgnoreSelector: Option.Option<string>,
  toMessage: (press: PointerPress) => Message,
) =>
  h.OnPointerDown(
    (_pointerType, button, _screenX, _screenY, _timeStamp, clientX, clientY, _pointerId, target) =>
      Option.exists(maybeIgnoreSelector, (selector) => isInside(target, selector))
        ? Option.none()
        : Option.some(toMessage({ button, clientX, clientY })),
  );

export const canvasItem = (h: HtmlBuilder<Message>) => h.DataAttribute(CANVAS_ITEM_ATTRIBUTE, "");

export const px = (value: number): string => `${value}px`;

export const iconButton = (
  h: HtmlBuilder<Message>,
  config: Readonly<{
    label: string;
    icon: Html | string;
    onClick: Message;
    className?: string;
    isDisabled?: boolean;
  }>,
): Html =>
  h.button(
    [
      h.Type("button"),
      h.AriaLabel(config.label),
      h.Title(config.label),
      h.Disabled(config.isDisabled ?? false),
      h.OnClick(config.onClick, { propagation: "Stop" }),
      h.Class(
        `inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent ${config.className ?? "h-6 w-6 text-xs"}`,
      ),
    ],
    [config.icon],
  );

export const warningBadge = (h: HtmlBuilder<Message>, messages: ReadonlyArray<string>): Html =>
  h.span(
    [
      h.Class(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-300",
      ),
      h.Title(messages.join("\n")),
      h.AriaLabel(`Warnings: ${messages.join("; ")}`),
    ],
    [`⚠ ${messages.length}`],
  );
