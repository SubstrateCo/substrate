import type { SaveAgentTriggersInput } from "@substrate/contracts/agents";
import type { SaveAgentInput } from "@substrate/contracts/agents";

import { api, type Api } from "../client";
import { readResult } from "../result";
import { uploadPictureFile } from "@/api/files/uploads";

export const listAgents = (signal?: AbortSignal) =>
  readResult(api.agents.list.$post({}, { init: { signal } }));
export const saveAgent = (json: SaveAgentInput) =>
  readResult(api.agents.actors.save.$post({ json }));
export const deleteAgent = (id: string) =>
  readResult(api.agents.actors.delete.$post({ json: { id } }));
export const saveAgentTriggers = (json: SaveAgentTriggersInput) =>
  readResult(api.agents.actors.triggers.$post({ json }));
// The server reads the calling desktop from the request. Other clients cannot become a home.
export const setAgentHomeDevice = (id: string) =>
  readResult(api.agents.actors.home.$post({ json: { id } }));

export function createAgentPictureApi(
  http: Api = api,
  storageFetch: typeof globalThis.fetch = globalThis.fetch,
) {
  const setAgentPicture = (id: string, fileId: string | null) =>
    readResult(http.agents.actors.picture.$post({ json: { id, fileId } }));

  async function uploadAgentPicture(
    id: string,
    file: File,
    signal?: AbortSignal,
    onCommit?: () => void,
  ) {
    const fileId = await uploadPictureFile(file, "avatar", signal, http, storageFetch);
    onCommit?.();
    // Attachment commits the visible picture. Do not cancel its response after it starts.
    return setAgentPicture(id, fileId);
  }
  return { setAgentPicture, uploadAgentPicture };
}

export const { setAgentPicture, uploadAgentPicture } = createAgentPictureApi();
