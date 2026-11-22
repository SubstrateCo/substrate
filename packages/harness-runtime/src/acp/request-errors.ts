import { HarnessError } from "../errors.ts";
import { acpAuthRequired } from "./api.ts";
import { z } from "zod";

const errorWithCode = z.object({ code: z.number() });

/** SDK dist/core/jsonrpc.d.ts: RequestError.unsupportedProtocolVersion lists data.supported. */
export const unsupportedVersion = z.object({
  code: z.literal(-32022),
  data: z.object({ supported: z.array(z.int()) }).catch({ supported: [] }),
});

/** Maps SDK errors to HarnessErrors. closed aborts when the connection ends. */
export async function native<T>(run: () => Promise<T>, closed?: AbortSignal): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (closed?.aborted)
      throw new HarnessError("disconnected", "The ACP connection closed.", { cause: error });
    if (error instanceof HarnessError) throw error;
    // auth_required in both SDK versions' schema/types.gen.d.ts ErrorCode.
    if (errorWithCode.safeParse(error).data?.code === -32000)
      throw new HarnessError(acpAuthRequired, "Sign in to the agent first.", { cause: error });
    const message = error instanceof Error ? error.message : "ACP request failed.";
    throw new HarnessError("native-request", message, { cause: error });
  }
}
