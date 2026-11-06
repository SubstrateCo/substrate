import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "@startup-os/contracts/auth/permissions";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
});
