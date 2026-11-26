import type {
  AgentRoutineView,
  ownerCreateRoutineInput,
  ownerUpdateRoutineInput,
} from "@substrate/contracts/agent-work";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

// The owner's routines. A routine the owner saves is approved as saved; one the agent wrote
// waits for the owner to approve its revision.
const routes = api["agent-work"];

export const listRoutines = ({
  data: { agentId, organizationId },
  signal,
}: ApiInput<{ agentId: string; organizationId: string }>): Promise<AgentRoutineView[]> =>
  readResult(
    routes.agents[":id"].routines.$get(
      { param: { id: agentId }, query: { organizationId } },
      { init: { signal } },
    ),
  );

export const createRoutine = ({
  data,
  signal,
}: ApiInput<z.input<typeof ownerCreateRoutineInput>>): Promise<AgentRoutineView> =>
  readResult(routes.routines.$post({ json: data }, { init: { signal } }));

export const updateRoutine = ({
  data: { routineId, ...json },
  signal,
}: ApiInput<
  z.input<typeof ownerUpdateRoutineInput> & { routineId: string }
>): Promise<AgentRoutineView> =>
  readResult(
    routes.routines[":id"].$patch({ param: { id: routineId }, json }, { init: { signal } }),
  );

export const deleteRoutine = ({
  data: { routineId, organizationId },
  signal,
}: ApiInput<{ routineId: string; organizationId: string }>): Promise<void> =>
  readResult(
    routes.routines[":id"].$delete(
      { param: { id: routineId }, query: { organizationId } },
      { init: { signal } },
    ),
  ).then(() => undefined);

export const approveRoutine = ({
  data: { routineId, organizationId, revision },
  signal,
}: ApiInput<{
  routineId: string;
  organizationId: string;
  revision: number;
}>): Promise<AgentRoutineView> =>
  readResult(
    routes.routines[":id"].approve.$post(
      { param: { id: routineId }, json: { organizationId, revision } },
      { init: { signal } },
    ),
  );
