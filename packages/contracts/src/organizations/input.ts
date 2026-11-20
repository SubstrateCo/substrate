import { organizationId } from "../workspace";
import { z } from "zod";

export const organizationWorkspace = z.object({ organizationId });
export const invitationParams = z.object({ invitationId: z.string().min(1).max(200) });
