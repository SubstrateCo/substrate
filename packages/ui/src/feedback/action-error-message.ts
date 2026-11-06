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

export function actionErrorMessage(
  error: Error,
  fallback = "We couldn’t complete this action. Please try again.",
): string {
  return reviewedMessages.get(normalize(error.message)) ?? fallback;
}
