import { z } from "zod";

const jsonValue = z.json();
export type JsonValue = z.infer<typeof jsonValue>;
