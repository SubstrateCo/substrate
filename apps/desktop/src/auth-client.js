import { createAuthClient } from "better-auth/client";
import { electronClient, handleDeepLink } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { desktopScheme } from "@startup-os/contracts/desktop/links";

/** @param {string} backend @param {string} frontend @param {boolean} smokeTest @param {() => import("electron").BrowserWindow | undefined} getWindow */
export function createDesktopAuthClient(backend, frontend, smokeTest, getWindow) {
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
  });
  return {
    authClient,
    /** @param {string} url */
    handleAuthLink: (url) => handleDeepLink({ $fetch: authClient.$fetch, options, url, getWindow }),
  };
}
