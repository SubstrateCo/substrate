import { projectRequest } from "./input.ts";
import { z } from "zod";

export const projectExport = projectRequest.extend({
  format: z.enum(["csv", "json"]).optional(),
});
export type ProjectExport = z.output<typeof projectExport>;
