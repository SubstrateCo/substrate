import type { GoogleError } from "../../integrations/google";

/**
 * Calendar provider registry failures. Provider calls throw their integration's errors, such as
 * those in `integrations/google`. `errorCode` is stored on the calendar and shown to its owner.
 */
export class CalendarProviderError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The provider has an adapter, but this server has no credentials for it. */
export class ProviderNotConfigured extends CalendarProviderError {
  constructor() {
    super("provider_not_configured", "This calendar provider is not configured on the server.");
  }
}

export class ProviderNotImplemented extends CalendarProviderError {
  constructor() {
    super("provider_not_implemented", "This calendar provider is not implemented.");
  }
}

/** A provider or registry failure, whose `errorCode` is safe to store and show. */
export type ProviderFailure = GoogleError | CalendarProviderError;
