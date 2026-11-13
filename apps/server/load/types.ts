export interface LoadUser {
  email: string;
  name: string;
  userId: string;
  organizationId: string;
  actorEntityId?: string;
  notification?: {
    messageId: string;
    conversationId: string;
    senderUserId: string;
    senderActorEntityId: string;
  };
  crm?: {
    accountEntityId: string;
    contactEntityId: string;
    dealEntityId: string;
    projectEntityId: string;
  };
  workspace?: {
    conversationId: string;
    projectEntityId: string;
    taskEntityId: string;
    discussionId: string;
  };
}

export interface FixtureCounts {
  users: number;
  organizations: number;
  channels: number;
  directMessages: number;
  groups: number;
  discussions: number;
  projects: number;
  tasks: number;
  messages: number;
  accounts: number;
  contacts: number;
  deals: number;
  followUps: number;
  notifications: number;
}

export interface LoadFixture {
  apiUrl: string;
  origin: string;
  password: string;
  seed: {
    version: number;
    profile: string;
    complete: boolean;
    countBasis: "planned-minimum";
    counts: FixtureCounts;
  };
  organizations: LoadOrganization[];
  users: LoadUser[];
}

export interface LoadOrganization {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  memberEmails: string[];
}
