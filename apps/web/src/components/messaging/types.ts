export type Message = {
  id: string;
  body: string;
  authorName: string;
  authorImage?: string | null;
  authorActorEntityId?: string | null;
  authorType?: "human" | "agent";
  authorExternal: boolean;
  createdAt: string | Date;
  threadId: string | null;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};
