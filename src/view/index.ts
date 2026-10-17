import type { Document, HtmlBuilder } from "foldkit/html";

import { diagnose } from "../domain/diagnostics";
import type { Message } from "../message";
import type { Model } from "../model";
import { canvasView } from "./canvas";
import { hudView, noticeView, toolbarView } from "./chrome";

export const windowTitle = (model: Model): string =>
  `${model.saveStatus === "Dirty" ? "• " : ""}${model.history.present.name} — Domain Modeler`;

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
        canvasView(model, diagnostics, h),
        hudView(model, h),
        ...noticeView(model, h),
        toolbarView(model, diagnostics, h),
      ],
    ),
  };
};
