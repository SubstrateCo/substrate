export const leaseMs = 3 * 60_000;
export const leaseGraceMs = 10 * 60_000;

export const leaseUntil = (now: Date) => new Date(now.getTime() + leaseMs);
