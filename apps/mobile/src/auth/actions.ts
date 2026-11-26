import { Platform } from "react-native";

import { mobileOrigin } from "../api/config";

export function authCallback(path: string) {
  return Platform.OS === "web"
    ? new URL(path, globalThis.location.origin).toString()
    : `${mobileOrigin}${path.replace(/^\//, "")}`;
}
