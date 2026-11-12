import { organizationId } from "../workspace";
import { z } from "zod";

export const organizationWorkspace = z.object({ organizationId });
