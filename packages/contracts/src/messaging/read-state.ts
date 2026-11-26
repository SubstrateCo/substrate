import { workspaceInput } from "./input";
import { z } from "zod";

export const conversationReadInput = workspaceInput.extend({
  conversationId: z.uuid(),
  messageId: z.uuid(),
  /** Reads this thread. Needed only to read a thread through its root. */
  threadId: z.uuid().optional(),
  /** Starts or renews (true) or ends (false) the reader's viewing lease. */
  viewing: z.boolean().optional(),
});
