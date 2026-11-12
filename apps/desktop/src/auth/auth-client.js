import { desktopScheme } from "@substrate/contracts/desktop/links";

import { electronClient, handleDeepLink } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";
import { createHash } from "node:crypto";

/** @param {string} backend @param {string} frontend @param {boolean} smokeTest @param {() => import("electron").BrowserWindow | undefined} getWindow @param {() => void} onSessionInvalidated @param {() => void} onSessionChanged */
export function createDesktopAuthClient(
  backend,
  frontend,
  smokeTest,
  getWindow,
  onSessionInvalidated,
  onSessionChanged,
) {
  const backendKey = createHash("sha256").update(new URL(backend).origin).digest("hex");
  /** @type {import("@better-auth/electron/client").ElectronClientOptions} */
  const options = {
    signInURL: new URL("/login", frontend),
    protocol: desktopScheme,
    storage: storage({ configName: `${smokeTest ? "auth-smoke-test" : "auth"}-${backendKey}` }),
    userImageProxy: { enabled: false },
    disableCache: true,
    sanitizeUser: (user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }),
  };
  const authClient = createAuthClient({
    baseURL: backend,
    plugins: [electronClient(options)],
    fetchOptions: {
      onRequest: (context) => {
        if (new URL(context.url).pathname.endsWith("/sign-out")) onSessionInvalidated();
      },
    },
  });
  // Cache-cookie updates do not change the signed-in identity. Keep those out of the
  // shutdown/reload path while the official plugin still persists every cookie update.
  const sessionToken = () =>
    authClient
      .getCookie()
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.split("=", 1)[0]?.endsWith(".session_token")) ?? "";
  /** @type {string | undefined} */
  let previousToken;
  authClient.$store.atoms.$sessionSignal.listen(() => {
    if (previousToken === undefined) return;
    const token = sessionToken();
    if (token === previousToken) return;
    previousToken = token;
    onSessionChanged();
  });
  return {
    authClient,
    // Call after app readiness, before starting any session-dependent services.
    initializeSession: () => {
      previousToken = sessionToken();
    },
    /** @param {string} url */
    handleAuthLink: (url) => handleDeepLink({ $fetch: authClient.$fetch, options, url, getWindow }),
  };
}
