export function isAccessFailure(error: Error | null | undefined): boolean {
  if (!error) return false;
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === "FORBIDDEN" ||
    status === "UNAUTHORIZED" ||
    [
      "FORBIDDEN",
      "UNAUTHORIZED",
      "ORGANIZATION_NOT_FOUND",
      "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
    ].includes(String(code)) ||
    [
      "Conversation not found or access denied.",
      "Project or task not found or access denied.",
      "Workspace access denied.",
      "You are not a member of this organization",
      "Your active workspace changed. Reload this page to continue.",
      "Sign in to continue.",
      "Verify your email to continue.",
    ].includes(error.message)
  );
}

export function isInvitationUnavailable(error: Error | null | undefined): boolean {
  if (!error) return false;
  const code = "code" in error ? error.code : undefined;
  return ["INVITATION_NOT_FOUND", "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"].includes(
    String(code),
  );
}
