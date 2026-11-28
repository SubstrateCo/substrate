import type {
  closeRequestInput,
  deviceHeartbeatInput,
  openRequestInput,
  placeAccessInput,
  registerDeviceInput,
  requestAnswersInput,
  sourcesInput,
} from "@substrate/contracts/agent-work";

import type { CommittedPublisher } from "../../shared/committed";
import type { DeviceScope, UserScope } from "../../shared/scope-types";
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
    deviceHeartbeat(this: void, scope: UserScope, input: z.output<typeof deviceHeartbeatInput>) {
      return serviceResult(async () => {
        await publish(await scope.owner.devices.touch(input.installationId));
        return {};
      });
    },
    loadSources(this: void, scope: DeviceScope, input: z.output<typeof sourcesInput>) {
      return serviceResult(async () =>
        publish(await scope.device.agentWork.loadSources(input.messageIds)),
      );
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
    requestStatus(this: void, scope: DeviceScope, requestId: string) {
      return serviceResult(() => scope.device.agentWork.requestStatus(requestId));
    },
    placeAccess(this: void, scope: DeviceScope, input: z.output<typeof placeAccessInput>) {
      return serviceResult(async () => ({
        allowed: await scope.device.agentWork.canUsePlace({
          conversationId: input.conversationId,
          threadId: input.threadId,
        }),
      }));
    },
  };
}
export type DeviceService = ReturnType<typeof createDeviceService>;
