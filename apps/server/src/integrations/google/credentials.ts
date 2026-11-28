import { hasGoogleProduct, type GoogleProduct } from "@substrate/contracts/integrations/google";

import { GoogleReauthRequired, GoogleScopeMissing, GoogleUnavailable } from "./errors";
import { APIError } from "better-auth/api";
import { z } from "zod";

const betterAuthCode = z
  .enum(["ACCOUNT_NOT_FOUND", "FAILED_TO_GET_ACCESS_TOKEN", "PROVIDER_NOT_SUPPORTED", "OTHER"])
  .catch("OTHER");

export interface GoogleTokenSource {
  api: {
    getAccessToken(input: {
      body: { accountId: string; userId: string };
    }): Promise<{ accessToken?: string; scopes: string[] }>;
  };
}

export async function googleAccessToken(input: {
  auth: GoogleTokenSource;
  userId: string;
  accountId: string;
  product: GoogleProduct;
}): Promise<string> {
  const { auth, userId, accountId, product } = input;
  let tokens: Awaited<ReturnType<GoogleTokenSource["api"]["getAccessToken"]>>;
  try {
    // Without request headers Better Auth trusts `userId` and selects the account by its
    // `account.id` among that user's accounts only.
    tokens = await auth.api.getAccessToken({ body: { accountId, userId } });
  } catch (error) {
    throw credentialFailure(
      betterAuthCode.parse(error instanceof APIError ? error.body?.code : undefined),
    );
  }
  if (!tokens.accessToken) throw new GoogleReauthRequired();
  if (!hasGoogleProduct(tokens.scopes.join(","), product)) throw new GoogleScopeMissing(product);
  return tokens.accessToken;
}

/**
 * Better Auth reports every refresh failure as FAILED_TO_GET_ACCESS_TOKEN, so a revoked grant and
 * a provider outage look the same. Revocation is the common cause, so the owner reconnects.
 */
function credentialFailure(code: z.output<typeof betterAuthCode>) {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
    case "FAILED_TO_GET_ACCESS_TOKEN":
      return new GoogleReauthRequired();
    case "PROVIDER_NOT_SUPPORTED":
      return new GoogleUnavailable("provider_not_configured", "Google is not configured.");
    case "OTHER":
      return new GoogleUnavailable("credential_unavailable", "Google tokens are unavailable.");
  }
}
