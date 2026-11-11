const validationMessages = [
  "Invalid email or password.",
  "An account with this email already exists.",
  "The passwords do not match.",
  "This workspace slug is already taken.",
  "Enter complete email addresses, separated by commas.",
  "Enter at least one recipient email address.",
  "Use a group message for more than one recipient.",
  "Enter at least two recipients for a group message.",
  "Enter a channel name.",
  "Enter at least one email address.",
  "At most 100 recipients are allowed.",
  "Your active workspace changed. Reload this page to continue.",
  "Sign in to continue.",
  "Verify your email to continue.",
  "A status with that name already exists.",
  "Cannot remove or downgrade the last owner.",
  "Select a status from this project.",
  "Enter a valid due date.",
  "Reassign or unassign this person’s and their agents’ tasks before removing project access.",
  "Reassign or unassign tasks whose assignees cannot access the destination project.",
  "A task cannot be its own parent or a child of its subtasks.",
  "Select a parent in the destination project.",
];

const normalize = (message: string) => message.trim().replace(/\.$/, "").toLowerCase();
const reviewedMessages = new Map(
  validationMessages.map((message) => [normalize(message), message]),
);
reviewedMessages.set("user already exists", "An account with this email already exists.");
reviewedMessages.set(
  "organization with this slug already exists",
  "This workspace slug is already taken.",
);
reviewedMessages.set("organization slug already taken", "This workspace slug is already taken.");
reviewedMessages.set(
  "user already invited to this organization",
  "An invitation has already been sent to this email. You can resend it below.",
);
reviewedMessages.set(
  "user is already a member of this organization",
  "This person is already a member of this workspace.",
);

/** Failures that need a different next step than "try again", found by code, never by message. */
function situationMessage(error: Error): string | undefined {
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  // `fetch` rejects with a TypeError when the request never reached the server.
  if (error instanceof TypeError) return "You’re offline. Check your connection and try again.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (code === "UNAUTHENTICATED") return "Your session ended. Sign in again.";
  return undefined;
}

export function actionErrorMessage(
  error: Error,
  fallback = "We couldn’t complete this action. Please try again.",
): string {
  return reviewedMessages.get(normalize(error.message)) ?? situationMessage(error) ?? fallback;
}
