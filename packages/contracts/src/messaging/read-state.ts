import { workspaceInput } from "./input";
import { z } from "zod";

export const conversationReadInput = workspaceInput.extend({
  conversationId: z.uuid(),
  messageId: z.uuid(),
});
