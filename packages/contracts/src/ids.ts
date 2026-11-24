let lastMs = -Infinity;
let counter = 0;

const hex = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));
/** Byte positions that start a new UUID group. */
const groupStarts = new Set([4, 6, 8, 10]);

/**
 * A UUIDv7 (RFC 9562): a 48-bit Unix millisecond prefix, then a 12-bit counter, then random bits.
 * IDs from one process sort in creation order, also within one millisecond and when the clock
 * steps back. IDs from different processes sort by millisecond. Order is a storage property:
 * pages still sort on their time column and use the ID only as the tiebreaker.
 */
export function newId(now = Date.now()): string {
  if (now > lastMs) {
    lastMs = now;
    // Start low in the counter range so a busy millisecond has room to count up.
    counter = crypto.getRandomValues(new Uint16Array(1))[0]! & 0x7ff;
  } else if (++counter > 0xfff) {
    // The counter is spent: borrow the next millisecond rather than repeat an order.
    lastMs += 1;
    counter = 0;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const high = Math.floor(lastMs / 2 ** 16);
  bytes[0] = high >>> 24;
  bytes[1] = high >>> 16;
  bytes[2] = high >>> 8;
  bytes[3] = high;
  bytes[4] = lastMs >>> 8;
  bytes[5] = lastMs;
  bytes[6] = 0x70 | (counter >>> 8);
  bytes[7] = counter;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  let id = "";
  for (let i = 0; i < 16; i++) {
    if (groupStarts.has(i)) id += "-";
    id += hex[bytes[i]!];
  }
  return id;
}
