export type Message = {
  id: string;
  body: string;
  authorName: string;
  authorId: string;
  authorExternal: boolean;
  createdAt: string | Date;
  threadId: string | null;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};
