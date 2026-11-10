import type {
  AgentInboxItemView,
  AgentRequestView,
  AgentTurnView,
} from "@startup-os/contracts/agent-work";

const newest = <T extends { createdAt: string }>(values: readonly T[]) =>
  values.reduce<T | undefined>(
    (best, value) =>
      !best || Date.parse(value.createdAt) > Date.parse(best.createdAt) ? value : best,
    undefined,
  );

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
    placements.set(anchor, [...(placements.get(anchor) ?? []), turn]);
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
    placements.set(ref.messageId, [...(placements.get(ref.messageId) ?? []), item]);
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
  const add = (map: Map<string, AgentRequestView[]>, id: string, request: AgentRequestView) =>
    map.set(id, [...(map.get(id) ?? []), request]);
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
