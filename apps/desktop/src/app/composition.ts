import {
  agentWorkChangeChannel,
  type AgentWorkChange,
} from "@substrate/contracts/agent-work/desktop";
import { realtimeEventChannel, type RealtimeUpdate } from "@substrate/contracts/realtime";

import { createAgentWorkService } from "../agents/service.ts";
import { sessionTokenCookie } from "../auth/auth-client.ts";
import { createHarnessController } from "../harness/controller/harness-controller.ts";
import { createHarnessProcess } from "../harness/worker/harness-process.ts";
import { createMailService } from "../mail/service.ts";
import {
  createMeetingReminders,
  type CalendarEventTarget,
} from "../notifications/meeting-reminders.ts";
import type { ScreenNotifications } from "../notifications/screen-notifications.ts";
import { DesktopSessionAuthority } from "../session/desktop-session-authority.ts";
import { readCalendarFeed } from "../transport/calendar-feed.ts";
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
  mailListWorkerEntry?: string;
  emit(channel: string, value: AgentWorkChange | RealtimeUpdate): void;
  showMessageNotification?: (onClick: () => Promise<void>) => () => void;
  openMessage?: (target: {
    organizationId: string;
    conversationId: string;
    messageId: string;
  }) => void;
  screenNotifications?: Pick<ScreenNotifications, "center" | "store" | "activate" | "deactivate">;
  openExternal?: (url: string) => void;
  openCalendarEvent?: (target: CalendarEventTarget) => void;
}) {
  const authority = new DesktopSessionAuthority(options);
  const mail = createMailService({ ...options, authority });
  const agentWork = createAgentWorkService({
    ...options,
    authority,
    inbox: mail.forAgent,
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
    mcpServers: agentWork.mcpServers,
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
  const screen = options.screenNotifications;
  const meetingReminders =
    screen &&
    createMeetingReminders({
      read: (organizationId, range) => readCalendarFeed(options, organizationId, range),
      sessionKey: () => sessionTokenCookie(options.getCookie()),
      center: screen.center,
      store: screen.store,
      openExternal: options.openExternal ?? (() => {}),
      openEvent: options.openCalendarEvent ?? (() => {}),
    });
  let notificationRecovery: ReturnType<typeof setInterval> | undefined;
  const socket = createRealtimeController({
    backend: options.backend,
    getCookie: () => options.getCookie(),
    emit: (event) => {
      options.emit(realtimeEventChannel, event);
      if (event.type === "change" && (event.domain === "access" || event.domain === "organization"))
        void mail.stop();
      agentWork.onRealtime(event);
      void meetingReminders?.receive(event);
      if (event.type === "ready") void notifications.connect(notificationOrganization);
      else if (event.type === "status" && event.status !== "connected") notifications.disconnect();
      else void notifications.receive(event);
    },
  });
  const realtime = {
    connect(input: { organizationId: string | null }) {
      notificationOrganization = input.organizationId;
      notifications.disconnect();
      // Reminders survive the renderer's reconnects. They reset only for a new session or workspace.
      if (input.organizationId) screen?.activate();
      void meetingReminders?.connect(input.organizationId);
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
    stopAgentWork: async () => {
      await Promise.all([agentWork.stop(), mail.stop()]);
    },
    closeSessions: () => harness.closeSessions(),
    disposeWorker: () => {
      harness.disconnect();
      authority.invalidate();
    },
    disconnectRealtime: () => {
      realtime.disconnect();
      // Sign-out, a session change, and quit all end here.
      meetingReminders?.disconnect();
      screen?.deactivate();
    },
  });
  return { harness, agentWork, realtime, authority, mail, meetingReminders, ...lifecycle };
}
