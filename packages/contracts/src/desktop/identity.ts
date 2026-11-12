export function desktopIdentity(production: boolean) {
  return production
    ? {
        name: "Substrate",
        directory: "Substrate",
        scheme: "substrate" as const,
        appId: "com.substrate.desktop",
      }
    : {
        name: "Substrate Dev",
        directory: "Substrate-dev",
        scheme: "substrate-dev" as const,
        appId: "com.substrate.desktop.dev",
      };
}

export type DesktopScheme = ReturnType<typeof desktopIdentity>["scheme"];
