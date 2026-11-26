import { z } from "zod";

const sections = z.enum(["contacts", "accounts", "deals", "pipeline", "interactions", "reports"]);
const views = z.enum(["timeline", "activity", "people", "accounts"]);
export type CrmSection = z.output<typeof sections>;
export type InteractionView = z.output<typeof views>;

/** URL parameters are untrusted, including when the caller already parsed the URL. */
export function crmSection(value?: string | null): CrmSection {
  return sections.catch("contacts").parse(value);
}

export function interactionView(value?: string | null): InteractionView {
  return views.catch("timeline").parse(value);
}
