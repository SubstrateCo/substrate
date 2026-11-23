import type { Actor } from "./fixtures";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";

const fixture = z.object({
  eventId: z.uuid(),
  privateEventId: z.uuid(),
  contactEntityId: z.uuid(),
});

/** Seed provider records outside the renderer; every browser read still uses the real API. */
export async function seedCalendar(actor: Actor) {
  const { stdout } = await promisify(execFile)(
    "bun",
    [
      fileURLToPath(new URL("../../../server/scripts/seed-calendar-e2e.ts", import.meta.url)),
      actor.email,
      actor.organizationId,
    ],
    { env: { ...process.env, NODE_ENV: "test" }, timeout: 30_000 },
  );
  return fixture.parse(JSON.parse(stdout));
}
