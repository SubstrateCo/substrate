import { AccessDeniedError, createRepositories, type Database } from "@substrate/database";
import type { StorageScope } from "@substrate/database/storage";

export function projectPictureAccess(db: Database) {
  async function projects(scope: StorageScope) {
    if (!scope.organizationId) throw new AccessDeniedError();
    return (
      await createRepositories(db).forSession({
        organizationId: scope.organizationId,
        userId: scope.userId,
      })
    ).projects;
  }
  return {
    async requireEdit(scope: StorageScope, id: string) {
      await (await projects(scope)).getPicture(id, "edit");
    },
    async canRead(scope: StorageScope, id: string) {
      try {
        return (await (await projects(scope)).getPicture(id)) !== null;
      } catch (error) {
        if (error instanceof AccessDeniedError) return false;
        throw error;
      }
    },
  };
}
