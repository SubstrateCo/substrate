import {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
  type SetAgentPictureInput,
  type SaveAgentInput,
} from "@startup-os/contracts/agents";
import { createAgentRepository } from "@startup-os/database/agents";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireOrigin } from "../../shared/workspace";

interface Dependencies {
  getSession: (input: {
    headers: Headers;
  }) => Promise<{ user: { id: string; emailVerified: boolean } } | null>;
  forUser: (userId: string) => ReturnType<typeof createAgentRepository>;
  requireOrigin: (headers: Headers) => void;
}

export function createAgentService(dependencies: Dependencies) {
  async function repositories(headers: Headers, mutation = false) {
    if (mutation) dependencies.requireOrigin(headers);
    const session = await dependencies.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    return dependencies.forUser(session.user.id);
  }

  return {
    listAgents(this: void, headers: Headers) {
      return serviceResult(async () => (await repositories(headers)).list());
    },
    saveAgent(this: void, headers: Headers, raw: SaveAgentInput) {
      return serviceResult(async () =>
        (await repositories(headers, true)).saveAgent(saveAgentInput.parse(raw)),
      );
    },
    setAgentPicture(this: void, headers: Headers, raw: SetAgentPictureInput) {
      return serviceResult(async () => {
        const repository = await repositories(headers, true);
        const { id, fileId } = setAgentPictureInput.parse(raw);
        return repository.setPicture(id, fileId);
      });
    },
    deleteAgent(this: void, headers: Headers, raw: { id: string }) {
      return serviceResult(async () =>
        (await repositories(headers, true)).deleteAgent(deleteAgentInput.parse(raw).id),
      );
    },
  };
}

export const { listAgents, saveAgent, deleteAgent, setAgentPicture } = createAgentService({
  getSession: (input) => auth.api.getSession(input),
  forUser: (userId) => createAgentRepository(db, userId),
  requireOrigin,
});
