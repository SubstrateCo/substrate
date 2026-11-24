import { actorAuthorKind } from "../../core/actors/display-name";
import { joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";

export const actorSelection = {
  id: actors.entityId,
  name: joinedActorName(),
  type: actors.type,
};
/** An actor that wrote quoted text, labeled owner, member or agent for the reading agent. */
export function authorSelection(ownerUserId: string) {
  return { ...actorSelection, kind: actorAuthorKind(ownerUserId) };
}
