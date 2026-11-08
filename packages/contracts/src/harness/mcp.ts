import { z } from "zod";

export const workspaceApiRequest = z
  .object({
    method: z.enum(["GET", "POST", "DELETE"]),
    path: z.string().regex(/^\/api\/v1\/(tasks|messaging|context)\/[a-z-]+$/),
    input: z
      .record(z.string(), z.json())
      .refine(
        (input) => !Object.hasOwn(input, "organizationId"),
        "The desktop supplies the active organization.",
      ),
  })
  .strict();
export type WorkspaceApiRequest = z.infer<typeof workspaceApiRequest>;

export const workspaceApiResult = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.json() }),
  z.object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type WorkspaceApiResult = z.infer<typeof workspaceApiResult>;
export type WorkspaceApiProxy = (request: WorkspaceApiRequest) => Promise<WorkspaceApiResult>;
