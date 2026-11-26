import type {
  hostClaimInput,
  hostFinishInput,
  hostProgressInput,
  hostRecoverInput,
  hostRetryLaterInput,
  hostStartInput,
  hostSteerInput,
  hostSteerResultInput,
  hostSubmitItemInput,
} from "@substrate/contracts/agent-work/control";

import type { CommittedPublisher } from "../../shared/committed";
import type { DeviceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

/** Drops the device fields that the scope already checked. */
function body<T extends { organizationId: string; installationId: string }>(input: T) {
  const { organizationId: _, installationId: __, ...rest } = input;
  return rest;
}

/** The host API: the agent's home device claims, runs and reports its turns. */
export function createHostService({ publish }: { publish: CommittedPublisher }) {
  return {
    claim(this: void, scope: DeviceScope, input: z.output<typeof hostClaimInput>) {
      return serviceResult(async () => ({
        turns: await publish(await scope.device.host.claim({ busyFolders: input.busyFolders })),
      }));
    },
    sync(this: void, scope: DeviceScope) {
      return serviceResult(async () => ({ turns: await scope.device.host.sync() }));
    },
    start(this: void, scope: DeviceScope, turnId: string, input: z.output<typeof hostStartInput>) {
      return serviceResult(async () => publish(await scope.device.host.start(turnId, body(input))));
    },
    progress(
      this: void,
      scope: DeviceScope,
      turnId: string,
      input: z.output<typeof hostProgressInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.device.host.progress(turnId, body(input))),
      );
    },
    finish(
      this: void,
      scope: DeviceScope,
      turnId: string,
      input: z.output<typeof hostFinishInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.device.host.finish(turnId, body(input))),
      );
    },
    retryLater(
      this: void,
      scope: DeviceScope,
      turnId: string,
      input: z.output<typeof hostRetryLaterInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.device.host.retryLater(turnId, body(input))),
      );
    },
    recover(
      this: void,
      scope: DeviceScope,
      turnId: string,
      input: z.output<typeof hostRecoverInput>,
    ) {
      return serviceResult(async () =>
        publish(await scope.device.host.recover(turnId, body(input))),
      );
    },
    steer(this: void, scope: DeviceScope, turnId: string, input: z.output<typeof hostSteerInput>) {
      return serviceResult(async () => publish(await scope.device.host.steer(turnId, body(input))));
    },
    steerResult(
      this: void,
      scope: DeviceScope,
      itemId: string,
      input: z.output<typeof hostSteerResultInput>,
    ) {
      return serviceResult(async () =>
        publish(
          await scope.device.host.steerResult(itemId, {
            turnId: input.turnId,
            result: input.result,
          }),
        ),
      );
    },
    submitItem(this: void, scope: DeviceScope, input: z.output<typeof hostSubmitItemInput>) {
      return serviceResult(async () =>
        publish(
          await scope.device.host.submitEpoch({
            sessionId: input.sessionId,
            fromEpoch: input.fromEpoch,
            body: input.body,
          }),
        ),
      );
    },
  };
}
export type HostService = ReturnType<typeof createHostService>;
