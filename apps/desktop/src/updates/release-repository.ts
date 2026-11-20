import { z } from "zod";

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/** The public GitHub repository that hosts installers and update feeds. Written at build time. */
export const releaseRepositorySchema = z.object({ owner: name, repo: name });
export type ReleaseRepository = z.infer<typeof releaseRepositorySchema>;

/**
 * The release repository for a build. CI sets SUBSTRATE_RELEASES_OWNER and SUBSTRATE_RELEASES_REPO
 * to the same values it passes to electron-builder's publish config, so the release page that
 * macOS opens matches the feed electron-updater reads. The package.json publish config is the
 * default for both.
 */
export function resolveReleaseRepository(
  env: Record<string, string | undefined>,
  defaults: Partial<ReleaseRepository>,
) {
  return releaseRepositorySchema.parse({
    owner: env.SUBSTRATE_RELEASES_OWNER || defaults.owner,
    repo: env.SUBSTRATE_RELEASES_REPO || defaults.repo,
  });
}

export function releasePageURL(repository: ReleaseRepository, version: string) {
  return `https://github.com/${repository.owner}/${repository.repo}/releases/tag/v${encodeURIComponent(version)}`;
}
