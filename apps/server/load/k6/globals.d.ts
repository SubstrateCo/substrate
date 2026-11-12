// Globals the k6 runtime provides that @types/k6 does not declare.
declare global {
  var console: {
    log(...values: unknown[]): void;
    warn(...values: unknown[]): void;
    error(...values: unknown[]): void;
  };
  var crypto: { randomUUID(): string };
}

export {};
