import type {
  AgentInboxItemView,
  AgentRequestView,
  AgentTurnView,
} from "@substrate/contracts/agent-work";

const newest = <T extends { createdAt: string }>(values: readonly T[]) =>
  values.reduce<T | undefined>(
    (best, value) =>
      !best || Date.parse(value.createdAt) > Date.parse(best.createdAt) ? value : best,
    undefined,
  );

function add<T>(map: Map<string, T[]>, id: string, value: T) {
  const list = map.get(id);
  if (list) list.push(value);
  else map.set(id, [value]);
}

/**
 * The message a turn's work shows under, in one conversation, or null when it has no place
 * there (it shows only in the Agents app). In order: the latest message the turn posted here;
 * the anchor of the request an answer or approval turn continues; the place of the turn a
 * recovery turn resumes; the newest source message here.
 */
function turnAnchor(
  turn: AgentTurnView,
  conversationId: string,
  turns: ReadonlyMap<string, AgentTurnView>,
  visited: Set<string> = new Set(),
): string | null {
  if (visited.has(turn.id)) return null;
  visited.add(turn.id);
  const output = newest(
    turn.outputs.flatMap((entry) =>
      entry.kind === "message" && entry.conversationId === conversationId ? [entry] : [],
    ),
  );
  if (output) return output.id;
  const anchor = turn.requestAnchors
    .map((entry) => entry.anchorMessageId)
    .filter((id) => id !== null)
    .at(-1);
  if (anchor) return anchor;
  const resumed = turn.resumesTurnId ? turns.get(turn.resumesTurnId) : undefined;
  if (resumed) {
    const place = turnAnchor(resumed, conversationId, turns, visited);
    if (place) return place;
  }
  const source = newest(
    turn.sourceMessages.filter((entry) => entry.conversationId === conversationId),
  );
  return source?.messageId ?? null;
}

/**
 * The conversation a turn's work shows in, in the order `turnAnchor` uses: where it posted last,
 * then where the turn it resumes shows, then its newest source. A request anchor names only a
 * message, so it adds no conversation. Undefined when the turn shows only in the Agents app.
 */
export function turnConversation(
  turn: AgentTurnView,
  turns: ReadonlyMap<string, AgentTurnView>,
  visited: Set<string> = new Set(),
): string | undefined {
  if (visited.has(turn.id)) return undefined;
  visited.add(turn.id);
  const output = newest(turn.outputs.filter((entry) => entry.kind === "message"));
  if (output) return output.conversationId;
  const resumed = turn.resumesTurnId ? turns.get(turn.resumesTurnId) : undefined;
  const place = resumed && turnConversation(resumed, turns, visited);
  if (place) return place;
  return newest(turn.sourceMessages)?.conversationId;
}

/** Turns grouped under the message they show under, oldest first. */
export function turnPlacements(turns: readonly AgentTurnView[], conversationId: string) {
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const placements = new Map<string, AgentTurnView[]>();
  const anchors = new Map<string, string>();
  const sorted = [...turns].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const turn of sorted) {
    const anchor = turnAnchor(turn, conversationId, byId);
    if (!anchor) continue;
    anchors.set(turn.id, anchor);
    add(placements, anchor, turn);
  }
  return { placements, anchors };
}

/**
 * Owner messages that wait, steer, or need attention, under the message they came from. Items
 * that started a turn are shown by that turn instead.
 */
export function itemPlacements(
  items: readonly AgentInboxItemView[],
  turns: readonly AgentTurnView[],
  conversationId: string,
) {
  const started = new Set(turns.flatMap((turn) => turn.itemIds));
  const placements = new Map<string, AgentInboxItemView[]>();
  for (const item of items) {
    const ref = item.sourceRef;
    if (ref.source !== "owner_message" || ref.conversationId !== conversationId) continue;
    if (started.has(item.id)) continue;
    add(placements, ref.messageId, item);
  }
  return placements;
}

/**
 * Request cards under their anchor message, else under their turn's place. Executed proposals
 * also show a backlink under the message they created.
 */
export function requestPlacements(
  requests: readonly AgentRequestView[],
  turnAnchors: ReadonlyMap<string, string>,
  conversationId: string,
) {
  const cards = new Map<string, AgentRequestView[]>();
  const backlinks = new Map<string, AgentRequestView[]>();
  for (const request of requests) {
    const receipt = request.proposal?.outcome;
    if (
      receipt?.status === "executed" &&
      receipt.receipt.kind === "message" &&
      receipt.receipt.conversationId === conversationId
    )
      add(backlinks, receipt.receipt.id, request);
    const { place } = request;
    if (place.access !== "visible" || place.conversationId !== conversationId) continue;
    const anchor = place.anchorMessageId ?? turnAnchors.get(request.turnId);
    if (anchor) add(cards, anchor, request);
  }
  return { cards, backlinks };
}
