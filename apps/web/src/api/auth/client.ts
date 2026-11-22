import { ac, roles } from "@substrate/contracts/auth/permissions";

import "@/lib/desktop/auth";
import { desktop } from "@/lib/desktop/identity";
import { electronProxyClient } from "@better-auth/electron/proxy";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), electronProxyClient({ protocol: desktop.scheme })],
});
