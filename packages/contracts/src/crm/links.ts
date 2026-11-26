import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const crmLinks = z.object({ organizationId, entityId: z.uuid() });
export const crmLink = crmLinks.extend({ otherEntityId: z.uuid() });
export type CrmLink = z.output<typeof crmLink>;
