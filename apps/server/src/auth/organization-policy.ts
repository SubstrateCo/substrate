import { z } from "zod";

export const organizationBody = z.object({ keepCurrentActiveOrganization: z.boolean().optional() });
export const organizationResult = z
  .object({
    id: z.string().optional(),
    member: z.object({ organizationId: z.string() }).optional(),
  })
  .nullable();

// undefined means no preference change; null means an explicit successful unset.
export function rememberedOrganization(
  path: string,
  body: z.infer<typeof organizationBody>,
  result: z.infer<typeof organizationResult>,
) {
  if (path === "/organization/set-active" && result === null) return null;
  if (!result) return undefined;
  if (path === "/organization/set-active") {
    return result.id;
  }
  if (path === "/organization/create") {
    if (body.keepCurrentActiveOrganization === true) return undefined;
    return result.id;
  }
  if (path === "/organization/accept-invitation") {
    return result.member?.organizationId;
  }
  return undefined;
}
