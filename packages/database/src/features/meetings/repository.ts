import type { ManualMeeting, SourceInput } from "@substrate/contracts/meetings";

import type { RepositoryContext } from "../../core/repository-context";
import { previousRequest, recordRequest, requestFingerprint } from "../../core/requests/once";
import { advanceArchive, archiveForWrite, type WritableArchive } from "./archive";
import { manualOriginal } from "./manual";
import { meetingReads } from "./reads";
import { decide, receive, zeroCounts } from "./reconcile";
import { meetingSources } from "./schema";
import { eq, and } from "drizzle-orm";

async function sourceId(a: WritableArchive, provider: "hex" | "manual") {
  const sourceKey = provider === "hex" ? "markdown" : "entry";
  const key = and(
    eq(meetingSources.archiveId, a.id),
    eq(meetingSources.provider, provider),
    eq(meetingSources.sourceKey, sourceKey),
  );
  const [existing] = await a.ctx.db
    .select({ id: meetingSources.id })
    .from(meetingSources)
    .where(key);
  if (existing) return existing.id;
  // advanceArchive serialized writes to this archive.
  const [created] = await a.ctx.db
    .insert(meetingSources)
    .values({
      archiveId: a.id,
      org: a.org,
      provider,
      sourceKey,
      label: provider === "hex" ? "Markdown imports" : "Manual entries",
    })
    .returning({ id: meetingSources.id });
  return created!.id;
}

export function meetingsRepository(ctx: RepositoryContext) {
  return {
    ...meetingReads(ctx),
    async create(meeting: ManualMeeting, requestId: string) {
      const a = await archiveForWrite(ctx, true);
      const previous = await previousRequest(
        ctx,
        "meeting",
        requestId,
        requestFingerprint(meeting),
      );
      if (previous) {
        await ctx.requireAccess(previous, "view");
        return { id: previous };
      }
      await advanceArchive(a);
      const record = manualOriginal(meeting, `${ctx.scope.actorEntityId}:${requestId}`);
      const { meetingId } = await receive(a, await sourceId(a, "manual"), "manual", record);
      if (!meetingId) throw new Error("Manual meeting was not created.");
      await recordRequest(ctx, "meeting", requestId, meetingId);
      return { id: meetingId };
    },
    async importHex(record: SourceInput) {
      const a = await archiveForWrite(ctx, true);
      await advanceArchive(a);
      const counts = zeroCounts();
      const { outcome } = await receive(a, await sourceId(a, "hex"), "hex", record);
      counts[outcome]++;
      return counts;
    },
    async decide(id: string, candidateId: string, combine: boolean) {
      const a = await archiveForWrite(ctx);
      await advanceArchive(a);
      await decide(a, id, candidateId, combine);
      return true;
    },
  };
}
