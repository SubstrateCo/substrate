import { backendURL } from "./bundled-renderer.js";
import { storageOrigins } from "./storage.js";

/** The public origins a build writes to desktop-config.json. */
export interface PublicConfig {
  apiURL: string;
  webURL?: string;
  storageOrigins: string[];
}

/**
 * The validated public origins of the desktop app. Never serialize the environment itself.
 * Without built, as at build time and in development, they come from the environment. A
 * packaged app passes its build's values and uses only those, so that environment variables on
 * the machine cannot redirect or widen them. Signed uploads go to the storage endpoint the
 * server signs with.
 */
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
