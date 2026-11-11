/* oxlint-disable deslop/no-unknown-parameters -- The composition root forwards typed domain events through one structured-clone transport. */
import { agentWorkChangeChannel } from "@substrate/contracts/agent-work/desktop";
import { realtimeEventChannel } from "@substrate/contracts/realtime";

import { createAgentWorkService } from "../agents/service.ts";
import { createHarnessController } from "../harness/controller/harness-controller.ts";
import { createHarnessProcess } from "../harness/worker/harness-process.ts";
import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import { createRealtimeController } from "../transport/realtime-controller.ts";
import { createLifecycle } from "./lifecycle.ts";

export function composeDesktop(options: {
  backend: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  getCookie(): string;
  accountsDirectory: string;
  installationId: string;
  device: { name: string; platform: string };
  workerEntry: string;
  migrationsDirectory?: string;
  emit(channel: string, value: unknown): void;
}) {
  const authority = new DesktopSessionAuthority(options);
  const agentWork = createAgentWorkService({
    ...options,
    authority,
    harness: {
      synchronize: () => harness.run("synchronize").then(() => {}),
      execute: (command) => harness.execute(command),
      closeOrganization: (organizationId) => harness.closeOrganization(organizationId),
      readProfile: (agentId) => harness.readProfile(agentId),
    },
    notify: (change) => options.emit(agentWorkChangeChannel, change),
    log: (message) => console.warn(message),
  });
  const harness = createHarnessController({
    ...options,
    authority,
    localToolHandler: (request) => agentWork.handleLocalTool(request),
    onResult: (request, result) => agentWork.observeToolCall(request, result),
    createWorker: (directory, proxy, localTools) =>
      createHarnessProcess(
        options.workerEntry,
        directory,
        (event) => agentWork.onHarnessEvent(event),
        proxy,
        localTools,
      ),
  });
  const realtime = createRealtimeController({
    backend: options.backend,
    getCookie: () => options.getCookie(),
    emit: (event) => {
      options.emit(realtimeEventChannel, event);
      agentWork.onRealtime(event);
    },
  });
  const lifecycle = createLifecycle({
    stopAgentWork: () => agentWork.stop(),
    closeSessions: () => harness.closeSessions(),
    disposeWorker: () => {
      harness.disconnect();
      authority.invalidate();
    },
    disconnectRealtime: () => realtime.disconnect(),
  });
  return { harness, agentWork, realtime, authority, ...lifecycle };
}
