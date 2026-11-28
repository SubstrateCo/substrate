import { backendURL } from "./bundled-renderer.ts";
import { storageOrigins } from "./storage.ts";
import { z } from "zod";

export const publicConfigSchema = z.object({
  apiURL: z.string(),
  webURL: z.string().optional(),
  storageOrigins: z.array(z.string()),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;

export function resolvePublicConfig(
  env: Record<string, string | undefined>,
  options: { packaged: boolean; built?: Partial<PublicConfig> },
) {
  const { packaged, built } = options;
  const web = built ? built.webURL : env.SUBSTRATE_WEB_URL;
  const storageEndpoint = built ? undefined : env.S3_ENDPOINT;
  return {
    apiURL: backendURL(built ? built.apiURL : env.SUBSTRATE_API_URL, packaged),
    webURL: web || packaged ? backendURL(web, packaged) : undefined,
    storageOrigins: storageOrigins(
      storageEndpoint ? new URL(storageEndpoint).origin : built?.storageOrigins,
      packaged,
    ),
  } satisfies PublicConfig;
}
