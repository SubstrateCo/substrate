import type { GoogleProduct } from "@substrate/contracts/integrations/google";

export class GoogleError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class GoogleReauthRequired extends GoogleError {
  constructor() {
    super("reauth_required", "The Google account must be linked again.");
  }
}

export class GoogleScopeMissing extends GoogleError {
  constructor(public readonly product: GoogleProduct) {
    super(`${product}_scope_missing`, `The Google account has not granted ${product} access.`);
  }
}

export class GoogleRateLimited extends GoogleError {
  constructor(public readonly retryAfterMs: number | null) {
    super("provider_rate_limited", "Google rate-limited the request.");
  }
}

export class GoogleNotFound extends GoogleError {
  constructor() {
    super("provider_not_found", "The Google resource was not found.");
  }
}

export class GoogleGone extends GoogleError {
  constructor() {
    super("provider_gone", "The Google resource or sync cursor expired.");
  }
}

export class GoogleUnavailable extends GoogleError {
  constructor(
    errorCode: string,
    message: string,
    public readonly status?: number,
  ) {
    super(errorCode, message);
  }
}
