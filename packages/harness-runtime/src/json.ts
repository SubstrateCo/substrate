import { z } from "zod";

/** Any JSON value. Native payloads keep this type until the adapter that owns them parses them. */
export const jsonValue = z.json();
export type JsonValue = z.infer<typeof jsonValue>;
