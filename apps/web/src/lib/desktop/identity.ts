import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import { windowBridge } from "./bridges";

const production =
  typeof window === "undefined"
    ? import.meta.env.MODE === "production"
    : (windowBridge()?.production ?? import.meta.env.MODE === "production");

export const desktop = desktopIdentity(production);
