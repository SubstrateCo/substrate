import { z } from "zod";

/** The workspace a request acts in. The server checks it against the active session. */
export const organizationId = z.string().min(1).max(200);
