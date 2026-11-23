import type { MailColor, MailLabel } from "@substrate/contracts/mail";
import type { LabelDisplayChange } from "@substrate/contracts/mail/ipc";

import type { RunTransaction } from "../database.ts";
import { mailConnections, mailMessages } from "../schema/mail.ts";
import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";

type Grant = Pick<
  typeof mailConnections.$inferInsert,
  "provider" | "providerAccountId" | "address" | "protectedGrant"
>;

export function mailConnectionRepository(run: RunTransaction, org: string) {
  const connection = (id: string) =>
    and(eq(mailConnections.organizationId, org), eq(mailConnections.id, id));
  const updateLabel = (
    id: string,
    labelId: string,
    patch: Pick<MailLabel, "color" | "filterMode" | "hideInRows">,
  ) =>
    run(async (tx) => {
      const row = await tx
        .select({ labels: mailConnections.labels })
        .from(mailConnections)
        .where(connection(id))
        .get();
      if (!row?.labels.some((label) => label.id === labelId)) throw new Error("Label unavailable.");
      const labels = row.labels.map((label) =>
        label.id === labelId ? { ...label, ...patch } : label,
      );
      await tx.update(mailConnections).set({ labels }).where(connection(id));
    });
  return {
    // Refresh stale mail in the background when the verified workspace reopens.
    pendingSync: () =>
      run((tx) =>
        tx
          .select({ id: mailConnections.id })
          .from(mailConnections)
          .where(
            and(
              eq(mailConnections.organizationId, org),
              ne(mailConnections.status, "reconnect"),
              or(
                isNull(mailConnections.lastSync),
                lt(mailConnections.lastSync, Date.now() - 5 * 60_000),
                eq(mailConnections.status, "retry"),
              ),
            ),
          )
          .all(),
      ),
    // Main can reuse a previously selected OAuth client for another mailbox of the same provider.
    // Read only a sealed grant from this workspace in the current account's database.
    providerGrant: (provider: string) =>
      run(
        async (tx) =>
          (
            await tx
              .select({ grant: mailConnections.protectedGrant })
              .from(mailConnections)
              .where(
                and(
                  eq(mailConnections.organizationId, org),
                  eq(mailConnections.provider, provider),
                ),
              )
              .limit(1)
              .get()
          )?.grant,
      ),
    connection: (id: string) =>
      run((tx) => tx.select().from(mailConnections).where(connection(id)).get()),
    // A late refresh must neither replace a newly reconnected grant nor recreate a removed one.
    rotateGrant: (id: string, previous: string, protectedGrant: string) =>
      run(async (tx) => {
        const changed = await tx
          .update(mailConnections)
          .set({ protectedGrant })
          .where(and(connection(id), eq(mailConnections.protectedGrant, previous)))
          .returning({ id: mailConnections.id });
        if (!changed.length) throw new Error("Mailbox authorization changed.");
      }),
    connect: (grant: Grant & { nickname: string | null }) =>
      run(async (tx) => {
        const [row] = await tx
          .insert(mailConnections)
          .values({ ...grant, id: randomUUID(), organizationId: org })
          .onConflictDoUpdate({
            target: [
              mailConnections.organizationId,
              mailConnections.provider,
              mailConnections.providerAccountId,
            ],
            set: {
              address: grant.address,
              protectedGrant: grant.protectedGrant,
              status: "idle",
              nickname: grant.nickname || undefined,
            },
          })
          .returning({ id: mailConnections.id });
        return row!.id;
      }),
    // A reconnect is never an upsert. Disconnecting while Google is open cannot recreate the row.
    reconnect: (id: string, grant: Grant) =>
      run(async (tx) => {
        const renewed = await tx
          .update(mailConnections)
          .set({ address: grant.address, protectedGrant: grant.protectedGrant, status: "idle" })
          .where(
            and(
              connection(id),
              eq(mailConnections.provider, grant.provider),
              eq(mailConnections.providerAccountId, grant.providerAccountId),
            ),
          )
          .returning({ id: mailConnections.id });
        return renewed.length === 1;
      }),
    rename: (id: string, nickname: string) =>
      run(async (tx) => {
        const value = nickname.trim();
        if (value.length > 80) throw new Error("Nickname is too long.");
        const changed = await tx
          .update(mailConnections)
          .set({ nickname: value || null })
          .where(connection(id))
          .returning({ id: mailConnections.id });
        if (!changed.length) throw new Error("Mailbox unavailable.");
      }),
    labelColor: (id: string, labelId: string, color: MailColor | null) =>
      updateLabel(id, labelId, { color: color ?? undefined }),
    labelVisibility: (id: string, change: LabelDisplayChange) => {
      if (change.area === "sidebar")
        return updateLabel(id, change.labelId, {
          filterMode: change.mode === "show" ? undefined : change.mode,
        });
      if (change.area === "rows")
        return updateLabel(id, change.labelId, { hideInRows: !change.visible || undefined });
      return run(async (tx) => {
        const changed = await tx
          .update(mailConnections)
          .set({ showLabelFilters: change.visible })
          .where(connection(id))
          .returning({ id: mailConnections.id });
        if (!changed.length) throw new Error("Mailbox unavailable.");
      });
    },
    disconnect: (id: string) =>
      run(async (tx) => {
        await tx
          .delete(mailMessages)
          .where(and(eq(mailMessages.organizationId, org), eq(mailMessages.mailboxId, id)));
        await tx.delete(mailConnections).where(connection(id));
      }),
  };
}
