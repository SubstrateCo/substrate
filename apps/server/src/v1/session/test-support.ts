import type { AuthSession } from "../../shared/scope";

export function sessionFixture(
  overrides: {
    emailVerified?: boolean;
    organizationId?: string | null;
  } = {},
): AuthSession {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    user: {
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: overrides.emailVerified ?? true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "session-1",
      token: "test-token",
      userId: "user-1",
      expiresAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: now,
      updatedAt: now,
      activeOrganizationId:
        overrides.organizationId === undefined ? "organization-1" : overrides.organizationId,
    },
  };
}
