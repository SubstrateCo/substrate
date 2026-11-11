type AuthFailure = { message?: string; code?: string; status?: number };

const accessFailureCodes = new Set([
  "FORBIDDEN",
  "UNAUTHORIZED",
  "UNAUTHENTICATED",
  "WORKSPACE_CHANGED",
  "EMAIL_NOT_VERIFIED",
  "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION",
  "ORGANIZATION_NOT_FOUND",
  "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
  "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
]);

const invitationUnavailableCodes = new Set([
  "INVITATION_NOT_FOUND",
  "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
]);

export function isAuthAccessFailure(error: AuthError): boolean {
  return error.code !== undefined && accessFailureCodes.has(error.code);
}

export function isAuthInvitationUnavailable(error: AuthError): boolean {
  return error.code !== undefined && invitationUnavailableCodes.has(error.code);
}

const messages = new Map([
  ["INVALID_EMAIL_OR_PASSWORD", "Invalid email or password."],
  ["USER_ALREADY_EXISTS", "An account with this email already exists."],
  ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "An account with this email already exists."],
  ["ORGANIZATION_ALREADY_EXISTS", "This workspace slug is already taken."],
  ["ORGANIZATION_SLUG_ALREADY_TAKEN", "This workspace slug is already taken."],
  [
    "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
    "An invitation has already been sent to this email. You can resend it below.",
  ],
  [
    "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
    "This person is already a member of this workspace.",
  ],
  ["EMAIL_NOT_VERIFIED", "Verify your email to continue."],
  ["INVALID_TOKEN", "This link is invalid or expired. Request a new link."],
  ["TOKEN_EXPIRED", "This link is invalid or expired. Request a new link."],
]);

export class AuthError extends Error {
  public readonly code?: string;
  public readonly status?: number;
  public readonly userMessage?: string;

  constructor(error: AuthFailure) {
    super(error.message || "The authentication request failed.");
    this.name = "AuthError";
    this.code = error.code;
    this.status = error.status;
    this.userMessage = error.code ? messages.get(error.code) : undefined;
  }
}

export function authError(error: AuthFailure): AuthError {
  return new AuthError(error);
}
