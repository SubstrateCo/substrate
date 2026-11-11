import type { saveAgentTriggersInput } from "@substrate/contracts/agents";
import type {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@substrate/contracts/agents";
import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import { createAgentRepository } from "@substrate/database/agents";
import { agentRefreshHints } from "@substrate/database/realtime";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, requireVerified } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import { z } from "zod";

interface Dependencies {
  getSession: (input: {
    headers: Headers;
  }) => Promise<{ user: { id: string; emailVerified: boolean } } | null>;
  forUser: (userId: string, installationId?: string) => ReturnType<typeof createAgentRepository>;
  requireOrigin: (headers: Headers) => void;
  changed: (userId: string) => Promise<void>;
}

const installation = z.uuid();

export function createAgentService(dependencies: Dependencies) {
  async function repositories(headers: Headers, mutation = false) {
    if (mutation) dependencies.requireOrigin(headers);
    const session = requireVerified(await dependencies.getSession({ headers }));
    // The desktop main process adds its installation ID. It names a device of this user only.
    const installationId = installation.safeParse(headers.get(desktopInstallationHeader)).data;
    return {
      repository: dependencies.forUser(session.user.id, installationId),
      userId: session.user.id,
    };
  }

  return {
    listAgents(this: void, headers: Headers) {
      return serviceResult(async () => (await repositories(headers)).repository.list());
    },
    saveAgent(this: void, headers: Headers, input: z.output<typeof saveAgentInput>) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.saveAgent(input);
        await dependencies.changed(userId);
        return result;
      });
    },
    setAgentPicture(this: void, headers: Headers, input: z.output<typeof setAgentPictureInput>) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const { id, fileId } = input;
        const result = await repository.setPicture(id, fileId);
        await dependencies.changed(userId);
        return result;
      });
    },
    deleteAgent(this: void, headers: Headers, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.deleteAgent(input.id);
        await dependencies.changed(userId);
        return result;
      });
    },
    saveAgentTriggers(
      this: void,
      headers: Headers,
      input: z.output<typeof saveAgentTriggersInput>,
    ) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.saveTriggers(input);
        await dependencies.changed(userId);
        return result;
      });
    },
    setAgentHomeDevice(this: void, headers: Headers, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => {
        const { repository, userId } = await repositories(headers, true);
        const result = await repository.setHomeDevice(input.id);
        await dependencies.changed(userId);
        return result;
      });
    },
  };
}

export const {
  listAgents,
  saveAgent,
  deleteAgent,
  setAgentPicture,
  saveAgentTriggers,
  setAgentHomeDevice,
} = createAgentService({
  getSession: (input) => auth.api.getSession(input),
  forUser: (userId, installationId) => createAgentRepository(db, userId, installationId),
  requireOrigin,
  changed: (userId) => publishRefresh(agentRefreshHints(db, userId)),
});
