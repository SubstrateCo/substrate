export type Message = {
  id: string;
  body: string;
  authorName: string;
  authorImage?: string | null;
  authorActorEntityId?: string | null;
  authorType?: "human" | "agent";
  authorExternal: boolean;
  createdAt: string | Date;
  editedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  threadId: string | null;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};
