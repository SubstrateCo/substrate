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

export class CalendarAccessRequired extends CalendarProviderError {}

export class CalendarCursorExpired extends CalendarProviderError {}

export class CalendarProviderFailure extends CalendarProviderError {}
