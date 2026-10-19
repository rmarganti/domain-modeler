import type { Document, HtmlBuilder } from "foldkit/html";

import { diagnose } from "../domain/diagnostics";
import type { Message } from "../message";
import { isDirty, type Model } from "../model";
import { canvasView } from "./canvas";
import { chooserView } from "./chooser";
import { hudView, noticeView, toolbarView } from "./chrome";
import { shortcutsView } from "./shortcuts";
import { pickerView } from "./picker";

export const windowTitle = (model: Model): string =>
  `${isDirty(model) ? "• " : ""}${model.history.present.name} — Domain Modeler`;

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const document = model.history.present;
  // Diagnostics are derived on every render, so they always reflect the
  // current model without ever blocking an edit.
  const diagnostics = diagnose(document);
  return {
    title: windowTitle(model),
    body: h.main(
      [h.Class("fixed inset-0 overflow-hidden font-sans text-slate-900 antialiased")],
      [
        h.div(
          [
            h.Inert(
              model.editor._tag === "ViewingShortcuts" || model.editor._tag === "PickingCard",
            ),
          ],
          [
            canvasView(model, diagnostics, h),
            hudView(model, h),
            ...noticeView(model, h),
            toolbarView(model, diagnostics, h),
            ...chooserView(model, h),
          ],
        ),
        ...shortcutsView(model, h),
        ...pickerView(model, h),
      ],
    ),
  };
};
