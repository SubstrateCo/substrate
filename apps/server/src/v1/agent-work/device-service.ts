import type {
  ackWakesInput,
  closeRequestInput,
  deviceHeartbeatInput,
  openRequestInput,
  publishStatusInput,
  pullWakesInput,
  registerDeviceInput,
  requestAnswersInput,
  sourcesInput,
} from "@substrate/contracts/agent-work";

import type { CommittedPublisher } from "../../shared/committed";
import type { DeviceScope, UserScope, RegisteredUserDeviceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createDeviceService({ publish }: { publish: CommittedPublisher }) {
  return {
    registerDevice(this: void, scope: UserScope, input: z.output<typeof registerDeviceInput>) {
      return serviceResult(async () => {
        const result = await publish(await scope.owner.devices.register(input));
        return { id: result.id };
      });
    },
    deviceHeartbeat(
      this: void,
      _scope: RegisteredUserDeviceScope,
      _input: z.output<typeof deviceHeartbeatInput>,
    ) {
      return serviceResult(async () => {
        return {};
      });
    },
    pullWakes(this: void, scope: DeviceScope, input: z.output<typeof pullWakesInput>) {
      return serviceResult(async () =>
        publish(await scope.device.agentWork.pullWakes(input.limit, input.capabilities)),
      );
    },
    ackWakes(this: void, scope: DeviceScope, input: z.output<typeof ackWakesInput>) {
      return serviceResult(async () => publish(await scope.device.agentWork.ackWakes(input.ids)));
    },
    loadSources(this: void, scope: DeviceScope, input: z.output<typeof sourcesInput>) {
      return serviceResult(async () =>
        publish(await scope.device.agentWork.loadSources(input.messageIds, input.invocationIds)),
      );
    },
    publishStatus(this: void, scope: DeviceScope, input: z.output<typeof publishStatusInput>) {
      return serviceResult(async () => {
        const { organizationId: _, installationId: __, ...status } = input;
        return publish(await scope.device.agentWork.publishStatus(status));
      });
    },
    openRequest(this: void, scope: DeviceScope, input: z.output<typeof openRequestInput>) {
      return serviceResult(async () => {
        const { organizationId: _, installationId: __, ...request } = input;
        return publish(await scope.device.agentWork.openRequest(request));
      });
    },
    closeRequest(this: void, scope: DeviceScope, input: z.output<typeof closeRequestInput>) {
      return serviceResult(async () =>
        publish(await scope.device.agentWork.closeRequest(input.requestId, input.status)),
      );
    },
    requestAnswers(this: void, scope: DeviceScope, _input: z.output<typeof requestAnswersInput>) {
      return serviceResult(() => scope.device.agentWork.requestAnswers());
    },
  };
}
export type DeviceService = ReturnType<typeof createDeviceService>;
