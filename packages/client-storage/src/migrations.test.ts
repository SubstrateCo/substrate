import { openLocalDatabase } from "./database.ts";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrations = fileURLToPath(new URL("../migrations/", import.meta.url));

/** A database at the given migration, from a copy of the first migrations only. */
async function databaseAt(root: string, tag: string) {
  const journal = JSON.parse(await readFile(join(migrations, "meta", "_journal.json"), "utf8"));
  const entries = journal.entries.slice(
    0,
    journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag) + 1,
  );
  const folder = join(root, "migrations");
  await mkdir(join(folder, "meta"), { recursive: true });
  await writeFile(join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries)
    await copyFile(join(migrations, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  return openLocalDatabase(join(root, "agent-work.sqlite"), folder);
}

test("removing proposals drops approval results, their outputs and the proposed outcome", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "client-storage-migration-"));
  try {
    const before = await databaseAt(root, "0000_initial");
    const inbox = (id: string, source: string, status: string, turnId: string | null) => sql`
      INSERT INTO inbox (id, organization_id, session_id, user_agent_id, source, source_ref, lane,
        dedupe_key, available_at, deadline_at, status, reason, turn_id, created_at)
      VALUES (${id}, 'org-1', 's1', 'a1', ${source}, '{}', 'owner', ${`key:${id}`}, 0, 0,
        ${status}, ${status === "dropped" ? "source_inaccessible" : null}, ${turnId}, 0)`;
    await before.database.run(sql`
      INSERT INTO sessions (id, organization_id, user_agent_id, agent_id, key, kind, harness,
        created_at, updated_at)
      VALUES ('s1', 'org-1', 'a1', 'a1', 'dm:1', 'dm', 'claude', 0, 0)`);
    for (const [id, outcome] of [
      ["t1", "proposed"],
      ["t2", "asked"],
    ])
      await before.database.run(sql`
        INSERT INTO turns (id, session_id, user_agent_id, organization_id, folder_key, kind,
          status, outcome, epoch, created_at)
        VALUES (${id}, 's1', 'a1', 'org-1', 'main:a1', 'interactive', 'completed', ${outcome}, 0, 0)`);
    await before.database.run(inbox("pending", "approval_result", "pending", null));
    await before.database.run(inbox("in-turn", "approval_result", "consumed", "t1"));
    await before.database.run(inbox("in-event", "approval_result", "pending", null));
    await before.database.run(inbox("was-dropped", "approval_result", "dropped", "t1"));
    await before.database.run(inbox("answer", "answer", "pending", null));
    await before.database.run(sql`
      INSERT INTO turn_events (turn_id, seq, attempt, kind, item_id, data, created_at)
      VALUES ('t1', 1, 1, 'note', 'in-event', '{}', 0)`);
    for (const [targetId, requestKind] of [
      ["p1", "proposal"],
      ["q1", "question"],
    ])
      await before.database.run(sql`
        INSERT INTO outputs (turn_id, target_kind, target_id, request_kind, created_at)
        VALUES ('t1', 'request', ${targetId}, ${requestKind}, 0)`);
    before.close();

    const after = await openLocalDatabase(join(root, "agent-work.sqlite"));
    try {
      expect(
        await after.database.all(sql`SELECT id, status, reason FROM inbox ORDER BY id`),
      ).toEqual([
        ["answer", "pending", null],
        ["in-event", "dropped", "trigger_removed"],
        ["in-turn", "dropped", "trigger_removed"],
        ["was-dropped", "dropped", "source_inaccessible"],
      ]);
      expect(await after.database.all(sql`SELECT target_id FROM outputs`)).toEqual([["q1"]]);
      expect(await after.database.all(sql`SELECT id, outcome FROM turns ORDER BY id`)).toEqual([
        ["t1", "replied"],
        ["t2", "asked"],
      ]);
    } finally {
      after.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
