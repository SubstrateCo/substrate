/** An actor from an authoritative current-organization response. */
export type RecordActor = {
  entityId: string;
  userId: string | null;
  type: "human" | "agent";
};
