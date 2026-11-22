import { authClient } from "./client";
import { authError } from "./error";

export async function getSession(signal?: AbortSignal, disableCookieCache = false) {
  const { data, error } = await authClient.getSession({
    query: { disableCookieCache },
    fetchOptions: { signal },
  });
  if (error) throw authError(error);
  if (!data) return null;
  const { token: _token, ...session } = data.session;
  return { ...data, session };
}
