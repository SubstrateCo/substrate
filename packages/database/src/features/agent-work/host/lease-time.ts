/** How long a claim or renewal holds a turn. Hosts renew with their 60-second heartbeat. */
export const leaseMs = 3 * 60_000;
/** An expired lease of an agent still homed on its device waits this long for the host. */
export const leaseGraceMs = 10 * 60_000;

export const leaseUntil = (now: Date) => new Date(now.getTime() + leaseMs);
