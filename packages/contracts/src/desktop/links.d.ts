import type { ZodString } from "zod";

export const desktopOrigin: "https://desktop.startup-os.local";
export const desktopScheme: "startupos";
export const desktopInstallationHeader: "x-startup-os-installation";
export const desktopPath: ZodString;
export function desktopLink(path: string): string;
export function resolveDesktopLink(value: string, rendererOrigin: string): string | null;
