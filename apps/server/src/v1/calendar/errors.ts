/**
 * Calendar provider failures. Every error that leaves a provider adapter or the registry is one of
 * these: adapters map their integration's errors at their boundary and keep the original as
 * `cause`. `errorCode` is stored on the calendar and shown to its owner.
 */
export class CalendarProviderError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The provider has an adapter, but this server has no credentials for it. */
export class ProviderNotConfigured extends CalendarProviderError {
  constructor(options?: ErrorOptions) {
    super(
      "provider_not_configured",
      "This calendar provider is not configured on the server.",
      options,
    );
  }
}

export class ProviderNotImplemented extends CalendarProviderError {
  constructor() {
    super("provider_not_implemented", "This calendar provider is not implemented.");
  }
}

/** The grant was revoked or lacks calendar access. The owner must link the account again. */
export class CalendarAccessRequired extends CalendarProviderError {}

/** The sync cursor expired. The calendar must sync again without it. */
export class CalendarCursorExpired extends CalendarProviderError {}

/** Any other provider failure, such as an outage or a rate limit. A later attempt may succeed. */
export class CalendarProviderFailure extends CalendarProviderError {}
