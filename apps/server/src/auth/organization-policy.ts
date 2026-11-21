import { APIError } from "better-auth/api";
import { z } from "zod";

export function rethrowInvitationLookupError(path: string, returned: APIError): void {
  if (path !== "/organization/get-invitation") return;
  // Better Auth sends this one failure without a code; give it one so clients never match copy.
  const uncodedNotFound =
    returned.statusCode === 400 &&
    returned.body?.code === undefined &&
    returned.body?.message === "Invitation not found!";
  if (uncodedNotFound)
    throw new APIError("BAD_REQUEST", {
      ...returned.body,
      code: "INVITATION_NOT_FOUND",
    });
}

export const organizationBody = z.object({ keepCurrentActiveOrganization: z.boolean().optional() });
export const organizationResult = z
  .object({
    id: z.string().optional(),
    member: z.object({ organizationId: z.string() }).optional(),
  })
  .nullable();

// undefined means no preference change; null means an explicit successful unset.
export function rememberedOrganization(
  // oxlint-disable-next-line deslop/prefer-literal-union -- Better Auth hooks pass every endpoint path, not just organization changes.
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
