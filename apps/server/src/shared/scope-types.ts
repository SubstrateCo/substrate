import type { createRepositories } from "@substrate/database";

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    activeOrganizationId?: string | null;
  };
}

export interface SettingsScope {
  session: AuthSession | null;
  role: string | null;
}

type Repositories = ReturnType<typeof createRepositories>;

export interface IdentityScope {
  session: AuthSession;
  userId: string;
  organizationId: string | null;
  installationId?: string;
}

export interface UserScope extends IdentityScope {
  owner: Awaited<ReturnType<Repositories["forOwnerSession"]>>;
}

export interface WorkspaceScope extends IdentityScope {
  organizationId: string;
  repositories: Awaited<ReturnType<Repositories["forSession"]>>;
}

export interface DeviceScope extends IdentityScope {
  organizationId: string;
  installationId: string;
  device: Awaited<ReturnType<Repositories["forDeviceSession"]>>;
}
