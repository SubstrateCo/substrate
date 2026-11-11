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

// Agent configuration and home-device selection belong to the person, across workspaces.
export interface OwnerSessionIdentity {
  userId: string;
  installationId?: string;
}
