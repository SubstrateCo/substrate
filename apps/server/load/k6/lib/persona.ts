import { organizationSlug, resourceBand, selectResource, userProfile } from "../../workload.ts";
import { organizations, userOf } from "./data.ts";
import { recordObservation } from "./metrics.ts";
import { Rng } from "./random.ts";

// k6 isolates module state per VU; setup uses slot 1 but never runs a flow.
const user = userOf(Math.max(__VU, 1));
const slug = organizationSlug(user.organizationId, organizations);
export const rng = new Rng(`${slug}:${user.email}`);
export const persona = userProfile(user.email, slug);

export function pickResource<T>(
  items: readonly T[],
  id: (item: T) => string,
  relevance?: (item: T) => number,
) {
  const selected = selectResource(items, { seed: slug, random: rng, id, relevance });
  if (selected !== undefined)
    recordObservation("resource", resourceBand(items, slug, id, selected));
  return selected;
}
