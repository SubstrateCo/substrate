import { z } from "zod";

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const releaseRepositorySchema = z.object({ owner: name, repo: name });
export type ReleaseRepository = z.infer<typeof releaseRepositorySchema>;

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
