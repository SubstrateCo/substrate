import { createServerFn } from "@tanstack/react-start";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const { auth } = await import("@startup-os/auth/server");
  return auth.api.getSession({ headers: getRequestHeaders() });
});
