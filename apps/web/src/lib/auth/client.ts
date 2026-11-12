import { ac, roles } from "@substrate/contracts/auth/permissions";

import { desktop } from "../desktop/identity";
import { electronProxyClient } from "@better-auth/electron/proxy";
import { organizationClient } from "better-auth/client/plugins";
import "../desktop/auth";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), electronProxyClient({ protocol: desktop.scheme })],
});
