import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import { windowBridge } from "./bridges";

const production =
  typeof window === "undefined"
    ? import.meta.env.PROD
    : (windowBridge()?.production ?? import.meta.env.PROD);

export const desktop = desktopIdentity(production);
