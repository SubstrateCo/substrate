import { desktopScheme } from "@startup-os/contracts/desktop/links";

import { electronClient, handleDeepLink } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";

/** @param {string} backend @param {string} frontend @param {boolean} smokeTest @param {() => import("electron").BrowserWindow | undefined} getWindow @param {() => void} onSessionInvalidated @param {() => void} onSessionChanged */
export function createDesktopAuthClient(
  backend,
  frontend,
  smokeTest,
  getWindow,
  onSessionInvalidated,
  onSessionChanged,
) {
  /** @type {import("@better-auth/electron/client").ElectronClientOptions} */
  const options = {
    signInURL: new URL("/login", frontend),
    protocol: desktopScheme,
    storage: storage({ configName: smokeTest ? "auth-smoke-test" : "auth" }),
    userImageProxy: { enabled: false },
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
  authClient.$store.atoms.$sessionSignal.listen(onSessionChanged);
  return {
    authClient,
    /** @param {string} url */
    handleAuthLink: (url) => handleDeepLink({ $fetch: authClient.$fetch, options, url, getWindow }),
  };
}
