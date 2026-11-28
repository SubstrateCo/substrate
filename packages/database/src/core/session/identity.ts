export interface SessionIdentity {
  userId: string;
  organizationId: string;
  actorEntityId?: string;
}

export interface WorkspaceScope {
  userId: string;
  organizationId: string;
  actorEntityId: string;
  admin: boolean;
}

export interface OwnerSessionIdentity {
  userId: string;
  installationId?: string;
}
