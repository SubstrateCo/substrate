import type { ZodString } from "zod";

export const desktopOrigin: "https://desktop.substrate.local";
export const desktopScheme: "substrate";
export const desktopInstallationHeader: "x-substrate-installation";
export const desktopPath: ZodString;
export function desktopLink(path: string): string;
export function resolveDesktopLink(value: string, rendererOrigin: string): string | null;
