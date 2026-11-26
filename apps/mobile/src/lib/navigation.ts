import { z } from "zod";

const recordTarget = z.object({
  kind: z.enum(["task", "project", "contact", "interaction", "account", "deal"]),
  id: z.string().min(1),
  projectId: z.string().optional(),
});
export type RecordTarget = z.infer<typeof recordTarget>;

export function parseRecordTarget(value: string | undefined): RecordTarget | undefined {
  if (!value) return undefined;
  try {
    const result = recordTarget.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
