import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import { openMessageLink } from "../lib/screens/message-link.ts";
import { openConversation, showMessaging } from "../lib/screens/messaging.ts";
import {
  closeSearch,
  searchPage,
  type SearchKind,
  type SearchResult,
} from "../lib/screens/search.ts";
import { openProject, openTask, showTasks } from "../lib/screens/tasks.ts";
import { searchTerm, typedPrefixes } from "../lib/words.ts";
import type { World } from "../lib/world.ts";
import { FlowSkipped, type FlowContext } from "./flow.ts";
import { Counter } from "k6/metrics";

const steps = new Counter("search_steps");

function termFor(world: World, kind: SearchKind) {
  if (rng.chance(0.25)) {
    let names;
    if (kind === "project") names = world.projects.map((project) => project.title);
    else if (kind === "task") names = world.tasks.map((task) => task.title);
    else if (kind === "channel")
      names = world.conversations.flatMap((conversation) =>
        conversation.kind === "channel" ? [conversation.name] : [],
      );
    else
      names = [
        ...world.people.map((person) => person.name),
        ...world.conversations.map((conversation) => conversation.name),
      ];
    const name = rng.pick(names.filter(Boolean));
    if (name) return name.slice(0, 80);
  }
  return searchTerm();
}

async function typeSearch(world: World, text: string, kind: SearchKind, previous = "") {
  const candidates = typedPrefixes(text).filter((prefix) => prefix.length > previous.length);
  // Fluent bursts stay below debounce; only these 1–4 longer pauses reach the server.
  const count = rng.weighted([1, 2, 3, 4], (value) => [5, 4, 2, 1][value - 1]!)!;
  const prefixes = [...candidates.slice(0, count - 1), text].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  let rows: SearchResult[] = [];
  let length = previous.length;
  for (const prefix of prefixes) {
    await typeTime(prefix.slice(length));
    await think("glance");
    rows = await searchPage(world, prefix, kind);
    length = prefix.length;
  }
  return rows;
}

async function scan(rows: SearchResult[]) {
  // Scan snippets rather than reading every result's full text.
  await readTime(
    Math.ceil(rows.length / 4),
    rows.reduce((sum, row) => sum + (row.excerpt ?? row.title).length, 0) / 6,
  );
}

export async function search({ world }: FlowContext) {
  await think("navigate");
  const kind =
    config.mode === "coverage"
      ? "message"
      : rng.weighted<SearchKind>(
          ["all", "message", "task", "project", "channel"],
          (value) => ({ all: 50, message: 25, task: 12, project: 7, channel: 6 })[value],
        )!;
  const term = config.mode === "coverage" ? "Customer" : termFor(world, kind);
  try {
    let rows = await typeSearch(world, term, kind);
    await scan(rows);
    if (rows.length === 30 && (config.mode === "coverage" || rng.chance(0.35))) {
      await think("decide");
      steps.add(1, { step: "page" });
      rows = await searchPage(world, term, kind, rows.at(-1)!.id);
      await scan(rows);
    }
    if (config.mode !== "coverage" && rng.chance(rows.length ? 0.18 : 0.45)) {
      await think("decide");
      steps.add(1, { step: "refine" });
      const refined = `${term} ${searchTerm()}`.slice(0, 200);
      rows = await typeSearch(world, refined, kind, term);
      await scan(rows);
    }
    const result = rng.weighted(rows, (row) => 1 / (rows.indexOf(row) + 1));
    if (!result && config.mode === "coverage")
      throw new FlowSkipped("No seeded message search result");
    if (!result || (config.mode !== "coverage" && !rng.chance(0.72))) {
      steps.add(1, { step: "abandon" });
      return;
    }
    await think("decide");
    steps.add(1, { step: `open_${result.kind}` });
    closeSearch(world);
    if (result.conversationId) {
      const messages =
        result.kind === "message"
          ? await openMessageLink(world, result.conversationId, result.id)
          : (await showMessaging(world),
            (await openConversation(world, result.conversationId)).messages);
      await readTime(
        Math.min(messages.length, 8),
        messages.slice(-8).reduce((sum, message) => sum + message.body.length, 0),
      );
    } else if (result.projectEntityId) {
      await showTasks(world);
      await openProject(world, result.projectEntityId);
      if (result.kind === "task") await openTask(world, result.projectEntityId, result.id);
      await think("read");
    }
  } finally {
    closeSearch(world);
  }
}
import { config } from "../lib/config.ts";
