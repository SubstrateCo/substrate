import { invalidate, visit } from "../client-cache.ts";
import { config } from "../config.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import { rng } from "../persona.ts";
import { pictureImages } from "../picture-bytes.ts";
import { pictureContent, uploadPicture } from "../upload.ts";
import type { World } from "../world.ts";
import encoding from "k6/encoding";

/**
 * Avatars and project icons as <img> elements (components/people/person-avatar.tsx,
 * tasks/project-icon.tsx). A picture response is `no-store`, so the browser requests each
 * distinct source again whenever a pane mounts, and once more for rows that appear while it
 * stays mounted. Agent pictures (`/api/v1/files/:id/content`) are not loaded: the load data has
 * no agents.
 */

/** A picture from the person's disk. */
export const pickPicture = () => encoding.b64decode(rng.pick(pictureImages)!);

/**
 * Changes the profile picture (settings/profile, api/files/pictures.ts uploadPicture): upload,
 * save the URL on the user, refresh the session, and show the new avatar in the frame.
 */
export async function changeAvatar(world: World) {
  const url = await uploadPicture("avatar", pickPicture());
  if (!url || !(await call("auth.updateUser", { image: url }))) return false;
  await invalidate([keys.session], "mutation");
  await showPictures("frame", world.userId, [url]);
  return true;
}

/** A part of a screen that shows pictures; `id` is what it shows, such as a conversation. */
type Pane = "frame" | "timeline" | "thread" | "projects" | "board" | "task" | "members";

const panes = new Map<Pane, { id: string; visit: number; shown: Set<string> }>();

const isPicture = (url: string | null | undefined): url is string =>
  !!url && url.startsWith("/api/v1/files/pictures/");

/** Loads the sources a pane shows that it has not loaded since it mounted. */
export async function showPictures(pane: Pane, id: string, urls: (string | null | undefined)[]) {
  // Backfill renders nothing.
  if (config.mode === "backfill") return;
  let state = panes.get(pane);
  if (!state || state.id !== id || state.visit !== visit()) {
    state = { id, visit: visit(), shown: new Set() };
    panes.set(pane, state);
  }
  const fresh = [...new Set(urls.filter(isPicture))].filter((url) => !state.shown.has(url));
  for (const url of fresh) state.shown.add(url);
  await Promise.all(fresh.map(pictureContent));
}

/** A pane closed; its pictures load again when it opens next. */
export function hidePictures(pane: Pane) {
  panes.delete(pane);
}
