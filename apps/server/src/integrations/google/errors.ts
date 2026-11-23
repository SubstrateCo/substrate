import type { GoogleProduct } from "@substrate/contracts/integrations/google";

/**
 * A failed Google call. `errorCode` may be stored on a synced record and shown to its owner, so
 * it names the failure without tokens, response bodies, or other provider details.
 */
export class GoogleError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The grant was revoked or its refresh failed. The owner must link the account again. */
export class GoogleReauthRequired extends GoogleError {
  constructor() {
    super("reauth_required", "The Google account must be linked again.");
  }
}

/** The grant lacks a product's scopes. The owner must link the product again. */
export class GoogleScopeMissing extends GoogleError {
  constructor(public readonly product: GoogleProduct) {
    super(`${product}_scope_missing`, `The Google account has not granted ${product} access.`);
  }
}

/** Google rate-limited the call after the client's retries. */
export class GoogleRateLimited extends GoogleError {
  constructor(
    /** How long Google asked callers to wait, when it said. */
    public readonly retryAfterMs: number | null,
  ) {
    super("provider_rate_limited", "Google rate-limited the request.");
  }
}

export class GoogleNotFound extends GoogleError {
  constructor() {
    super("provider_not_found", "The Google resource was not found.");
  }
}

/** The resource or cursor is gone, such as an expired sync token. Start again without it. */
export class GoogleGone extends GoogleError {
  constructor() {
    super("provider_gone", "The Google resource or sync cursor expired.");
  }
}

/** A failure that a later attempt may not repeat, such as an outage or a refused request. */
export class GoogleUnavailable extends GoogleError {
  constructor(
    errorCode: string,
    message: string,
    /** The HTTP status, when Google answered. */
    public readonly status?: number,
  ) {
    super(errorCode, message);
  }
}
