export function leaveConsequence(publicChannel: boolean) {
  return publicChannel
    ? "It leaves your sidebar and you stop getting reply alerts. Mentions still reach you. You can still open it from links and search, and posting rejoins it."
    : "You lose access to its messages. A member who can manage it must add you back.";
}
