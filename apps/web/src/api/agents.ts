import type { SaveAgentInput } from "@startup-os/contracts/agents";

import { api } from "./client";
import { uploadPictureFile } from "./files";
import { readResult } from "./result";

export const listAgents = (signal?: AbortSignal) =>
  readResult(api.agents.list.$post({}, { init: { signal } }));
export const saveAgent = (json: SaveAgentInput) =>
  readResult(api.agents.actors.save.$post({ json }));
export const deleteAgent = (id: string) =>
  readResult(api.agents.actors.delete.$post({ json: { id } }));

export const setAgentPicture = (id: string, fileId: string | null) =>
  readResult(api.agents.actors.picture.$post({ json: { id, fileId } }));

export async function uploadAgentPicture(
  id: string,
  file: File,
  signal?: AbortSignal,
  onCommit?: () => void,
) {
  const fileId = await uploadPictureFile(file, "avatar", signal);
  onCommit?.();
  // Attachment commits the visible picture. Do not cancel its response after it starts.
  return setAgentPicture(id, fileId);
}
