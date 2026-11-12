import type { QueryClient } from "@tanstack/react-query";

export async function signOutAndClear(
  client: QueryClient,
  signOut: () => Promise<void>,
  desktop: boolean,
) {
  let revocationError: unknown;
  try {
    await signOut();
  } catch (error) {
    // The native plugin clears local credentials before attempting server revocation.
    if (!desktop) throw error;
    revocationError = error;
  }
  await client.cancelQueries();
  client.clear();
  return { revocationError };
}
