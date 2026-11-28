import { ac, roles } from "@substrate/contracts/auth/permissions";

import { Platform } from "react-native";

import { apiURL, mobileScheme, mobileOrigin } from "./config";
import { nativeFetch } from "./native-fetch";
import { expoClient } from "@better-auth/expo/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: apiURL,
  disableDefaultFetchPlugins: true,
  plugins: [
    organizationClient({ ac, roles }),
    expoClient({
      scheme: mobileScheme,
      storagePrefix: `substrate-${Array.from(apiURL, (character) => character.charCodeAt(0).toString(16)).join(".")}`,
      storage: SecureStore,
      disableCache: true,
    }),
  ],
  fetchOptions: {
    customFetchImpl: Platform.OS === "web" ? globalThis.fetch : nativeFetch,
    redirect: "error",
    credentials: Platform.OS === "web" ? "include" : "omit",
    headers: Platform.OS === "web" ? undefined : { Origin: mobileOrigin },
  },
});

export type Session = typeof authClient.$Infer.Session;
