import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
} from "@startup-os/auth/context-contract";
import {
  readMessageLinks,
  readMessagePeople,
  readRelatedContext,
  readMessageTarget,
  searchWorkspace,
  createSourceTask,
  attachMessageWork,
  detachMessageWork,
  readActivity,
  readNotifications,
  markNotificationRead,
} from "@startup-os/auth/context";

export const getMessageLinks = createServerFn({ method: "GET" })
  .validator(contextMessage)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readMessageLinks(getRequestHeaders(), data);
  });
export const getMessagePeople = createServerFn({ method: "GET" })
  .validator(contextMessage)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readMessagePeople(getRequestHeaders(), data);
  });
export const getRelatedContext = createServerFn({ method: "GET" })
  .validator(contextEntity)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readRelatedContext(getRequestHeaders(), data);
  });
export const getMessageTarget = createServerFn({ method: "GET" })
  .validator(contextTarget)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readMessageTarget(getRequestHeaders(), data);
  });
export const searchContext = createServerFn({ method: "GET" })
  .validator(contextSearch)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return searchWorkspace(getRequestHeaders(), data);
  });
export const createTaskFromMessage = createServerFn({ method: "POST" })
  .validator(contextSourceTask)
  .handler(({ data }) => createSourceTask(getRequestHeaders(), data));
export const attachWork = createServerFn({ method: "POST" })
  .validator(contextLink)
  .handler(({ data }) => attachMessageWork(getRequestHeaders(), data));
export const detachWork = createServerFn({ method: "POST" })
  .validator(contextLink)
  .handler(({ data }) => detachMessageWork(getRequestHeaders(), data));
export const getActivity = createServerFn({ method: "GET" })
  .validator(contextEntity)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readActivity(getRequestHeaders(), data);
  });
export const getNotifications = createServerFn({ method: "GET" })
  .validator(contextWorkspace)
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readNotifications(getRequestHeaders(), data);
  });
export const markRead = createServerFn({ method: "POST" })
  .validator(contextNotification)
  .handler(({ data }) => markNotificationRead(getRequestHeaders(), data));
