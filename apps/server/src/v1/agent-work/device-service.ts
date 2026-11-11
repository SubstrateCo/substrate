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
import * as work from "@substrate/database/agent-work";
import type { Database } from "@substrate/database/trusted";

import type { DeviceScope, UserScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createDeviceService({
  db,
  publish,
}: {
  db: Database;
  publish: CommittedPublisher;
}) {
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
    pullWakes(this: void, scope: DeviceScope, input: z.output<typeof pullWakesInput>) {
      return serviceResult(async () => publish(await work.pullWakes(db, scope, input.limit)));
    },
    ackWakes(this: void, scope: DeviceScope, input: z.output<typeof ackWakesInput>) {
      return serviceResult(async () => publish(await work.ackWakes(db, scope, input.ids)));
    },
    loadSources(this: void, scope: DeviceScope, input: z.output<typeof sourcesInput>) {
      return serviceResult(() => work.loadSources(db, scope, input.messageIds));
    },
    publishStatus(this: void, scope: DeviceScope, input: z.output<typeof publishStatusInput>) {
      return serviceResult(async () => {
        const { organizationId: _, installationId: __, ...status } = input;
        return publish(await work.publishStatus(db, scope, status));
      });
    },
    openRequest(this: void, scope: DeviceScope, input: z.output<typeof openRequestInput>) {
      return serviceResult(async () => {
        const { organizationId: _, installationId: __, ...request } = input;
        return publish(await work.openRequest(db, scope, request));
      });
    },
    closeRequest(this: void, scope: DeviceScope, input: z.output<typeof closeRequestInput>) {
      return serviceResult(async () =>
        publish(await work.closeRequest(db, scope, input.requestId, input.status)),
      );
    },
    requestAnswers(this: void, scope: DeviceScope, _input: z.output<typeof requestAnswersInput>) {
      return serviceResult(() => work.requestAnswers(db, scope));
    },
  };
}
export type DeviceService = ReturnType<typeof createDeviceService>;
