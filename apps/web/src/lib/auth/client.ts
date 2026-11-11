import { ac, roles } from "@substrate/contracts/auth/permissions";
import { desktopScheme } from "@substrate/contracts/desktop/links";

import { electronProxyClient } from "@better-auth/electron/proxy";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import "../desktop/auth";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), electronProxyClient({ protocol: desktopScheme })],
});
