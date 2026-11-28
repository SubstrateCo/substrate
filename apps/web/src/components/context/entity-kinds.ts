import {
  Bot,
  Building2,
  Contact,
  FolderKanban,
  Handshake,
  Hash,
  ListTodo,
  MessageSquare,
  MessageSquareText,
  MessagesSquare,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export const entityKinds = {
  task: { icon: ListTodo, label: "Task" },
  project: { icon: FolderKanban, label: "Project" },
  contact: { icon: Contact, label: "Contact" },
  account: { icon: Building2, label: "Account" },
  deal: { icon: Handshake, label: "Deal" },
  contact_interaction: { icon: MessageSquare, label: "Interaction" },
  person: { icon: UserRound, label: "Person" },
  agent: { icon: Bot, label: "Agent" },
  channel: { icon: Hash, label: "Channel" },
  thread: { icon: MessagesSquare, label: "Thread" },
  message: { icon: MessageSquareText, label: "Message" },
} as const satisfies Record<string, { icon: LucideIcon; label: string }>;
