import type { saveAgentTriggersInput } from "@substrate/contracts/agents";
import type {
  saveAgentInput,
  deleteAgentInput,
  setAgentPictureInput,
} from "@substrate/contracts/agents";
import { desktopInstallationHeader } from "@substrate/contracts/desktop/links";
import { createRepositories } from "@substrate/database";
import type { AgentRepository } from "@substrate/database/agents";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, requireVerified } from "../../shared/workspace";
import { publishCommitted } from "../realtime/committed";
import { z } from "zod";

interface Dependencies {
  getSession: (input: {
    headers: Headers;
  }) => Promise<{ user: { id: string; emailVerified: boolean } } | null>;
  forUser: (userId: string, installationId?: string) => AgentRepository | Promise<AgentRepository>;
  requireOrigin: (headers: Headers) => void;
  publish: typeof publishCommitted;
}

const installation = z.uuid();

export function createAgentService(dependencies: Dependencies) {
  async function repositories(headers: Headers, mutation = false) {
    if (mutation) dependencies.requireOrigin(headers);
    const session = requireVerified(await dependencies.getSession({ headers }));
    // The desktop main process adds its installation ID. It names a device of this user only.
    const installationId = installation.safeParse(headers.get(desktopInstallationHeader)).data;
    return {
      repository: await dependencies.forUser(session.user.id, installationId),
      userId: session.user.id,
    };
  }

  return {
    listAgents(this: void, headers: Headers) {
      return serviceResult(async () => (await repositories(headers)).repository.list());
    },
    saveAgent(this: void, headers: Headers, input: z.output<typeof saveAgentInput>) {
      return serviceResult(async () => {
        const { repository } = await repositories(headers, true);
        return dependencies.publish(await repository.saveAgent(input));
      });
    },
    setAgentPicture(this: void, headers: Headers, input: z.output<typeof setAgentPictureInput>) {
      return serviceResult(async () => {
        const { repository } = await repositories(headers, true);
        const { id, fileId } = input;
        return dependencies.publish(await repository.setPicture(id, fileId));
      });
    },
    deleteAgent(this: void, headers: Headers, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => {
        const { repository } = await repositories(headers, true);
        return dependencies.publish(await repository.deleteAgent(input.id));
      });
    },
    saveAgentTriggers(
      this: void,
      headers: Headers,
      input: z.output<typeof saveAgentTriggersInput>,
    ) {
      return serviceResult(async () => {
        const { repository } = await repositories(headers, true);
        return dependencies.publish(await repository.saveTriggers(input));
      });
    },
    setAgentHomeDevice(this: void, headers: Headers, input: z.output<typeof deleteAgentInput>) {
      return serviceResult(async () => {
        const { repository } = await repositories(headers, true);
        return dependencies.publish(await repository.setHomeDevice(input.id));
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
  forUser: async (userId, installationId) =>
    (await createRepositories(db).forOwnerSession({ userId, installationId })).agents,
  requireOrigin,
  publish: publishCommitted,
});
