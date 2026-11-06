import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "@startup-os/contracts/auth/permissions";
import { electronProxyClient } from "@better-auth/electron/proxy";
import { desktopScheme } from "@startup-os/contracts/desktop/links";
import "./desktop-auth";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), electronProxyClient({ protocol: desktopScheme })],
});
