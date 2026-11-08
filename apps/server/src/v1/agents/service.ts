import {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
  type SetAgentPictureInput,
  type SaveAgentInput,
} from "@startup-os/contracts/agents";
import { createAgentRepository } from "@startup-os/database/agents";
import { agentRefreshHints } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireOrigin } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";

interface Dependencies {
  getSession: (input: {
    headers: Headers;
  }) => Promise<{ user: { id: string; emailVerified: boolean } } | null>;
  forUser: (userId: string) => ReturnType<typeof createAgentRepository>;
  requireOrigin: (headers: Headers) => void;
  changed: (userId: string) => Promise<void>;
}

export function createAgentService(dependencies: Dependencies) {
  async function repositories(headers: Headers, mutation = false) {
    if (mutation) dependencies.requireOrigin(headers);
    const session = await dependencies.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    return { repository: dependencies.forUser(session.user.id), userId: session.user.id };
  }

  return {
    listAgents(this: void, headers: Headers) {
      return serviceResult(async () => (await repositories(headers)).repository.list());
    },
    saveAgent(this: void, headers: Headers, raw: SaveAgentInput) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.saveAgent(saveAgentInput.parse(raw));
        await dependencies.changed(userId);
        return result;
      });
    },
    setAgentPicture(this: void, headers: Headers, raw: SetAgentPictureInput) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const { id, fileId } = setAgentPictureInput.parse(raw);
        const result = await repository.setPicture(id, fileId);
        await dependencies.changed(userId);
        return result;
      });
    },
    deleteAgent(this: void, headers: Headers, raw: { id: string }) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.deleteAgent(deleteAgentInput.parse(raw).id);
        await dependencies.changed(userId);
        return result;
      });
    },
  };
}

export const { listAgents, saveAgent, deleteAgent, setAgentPicture } = createAgentService({
  getSession: (input) => auth.api.getSession(input),
  forUser: (userId) => createAgentRepository(db, userId),
  requireOrigin,
  changed: (userId) => publishRefresh(agentRefreshHints(db, userId)),
});
