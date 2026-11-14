import {
  agentWorkChangeChannel,
  type AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";
import { realtimeEventChannel, type RealtimeUpdate } from "@substrate/contracts/realtime";

import { createAgentWorkService } from "../agents/service.ts";
import { createHarnessController } from "../harness/controller/harness-controller.ts";
import { createHarnessProcess } from "../harness/worker/harness-process.ts";
import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import { createMessageNotifications } from "../transport/message-notifications.ts";
import { readNotificationFeed } from "../transport/notification-feed.ts";
import { createRealtimeController } from "../transport/realtime-controller.ts";
import { createLifecycle } from "./lifecycle.ts";
import { utilityProcess } from "electron";

export function composeDesktop(options: {
  backend: string;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  getCookie(): string;
  accountsDirectory: string;
  installationId: string;
  device: { name: string; platform: string };
  workerEntry: string;
  migrationsDirectory?: string;
  emit(channel: string, value: AgentWorkChange | RealtimeUpdate): void;
  showMessageNotification?: (onClick: () => Promise<void>) => () => void;
  openMessage?: (target: {
    organizationId: string;
    conversationId: string;
    messageId: string;
  }) => void;
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
        utilityProcess,
        options.workerEntry,
        directory,
        (event) => agentWork.onHarnessEvent(event),
        proxy,
        localTools,
      ),
  });
  let notificationOrganization: string | null = null;
  const notifications = createMessageNotifications({
    read: (organizationId) => readNotificationFeed(options, organizationId),
    sessionKey: () => options.getCookie(),
    show: options.showMessageNotification ?? (() => () => {}),
    open: options.openMessage ?? (() => {}),
  });
  let notificationRecovery: ReturnType<typeof setInterval> | undefined;
  const socket = createRealtimeController({
    backend: options.backend,
    getCookie: () => options.getCookie(),
    emit: (event) => {
      options.emit(realtimeEventChannel, event);
      agentWork.onRealtime(event);
      if (event.type === "ready") void notifications.connect(notificationOrganization);
      else if (event.type === "status" && event.status !== "connected") notifications.disconnect();
      else void notifications.receive(event);
    },
  });
  const realtime = {
    connect(input: { organizationId: string | null }) {
      notificationOrganization = input.organizationId;
      notifications.disconnect();
      socket.connect(input);
      // Main remains active while hidden. Recover a missed publish without renderer focus.
      clearInterval(notificationRecovery);
      notificationRecovery = setInterval(() => {
        void notifications.reconcile();
      }, 30_000);
      notificationRecovery.unref();
    },
    disconnect() {
      notificationOrganization = null;
      notifications.disconnect();
      clearInterval(notificationRecovery);
      notificationRecovery = undefined;
      socket.disconnect();
    },
  };
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
