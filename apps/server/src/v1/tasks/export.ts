import type { ProjectExport } from "@substrate/contracts/tasks/export";

import type { ExportRecord } from "../../shared/export";
import type { WorkspaceScope } from "../../shared/scope";
import { ServiceError, serviceResult } from "../../shared/service-result";

export function exportProject(scope: WorkspaceScope, input: ProjectExport) {
  return serviceResult(async () => {
    if (input.organizationId !== scope.organizationId)
      throw new ServiceError("FORBIDDEN", "Access denied.");
    const project = await scope.repositories.projects.get(input.projectEntityId);
    const columns = [
      "recordType",
      "entityId",
      "projectEntityId",
      "parentTaskEntityId",
      "name",
      "title",
      "description",
      "status",
      "priority",
      "assigneeActorEntityId",
      "assigneeName",
      "dueDate",
      "updatedAt",
    ];
    async function* records(): AsyncGenerator<ExportRecord> {
      yield {
        recordType: "project",
        entityId: project.entityId,
        name: project.name,
        description: project.description,
      };
      let afterEntityId: string | undefined;
      for (;;) {
        const rows = await scope.repositories.tasks.exportPage(project.entityId, afterEntityId);
        for (const { task, assignee, updatedAt } of rows) {
          yield {
            recordType: "task",
            entityId: task.entityId,
            projectEntityId: task.projectEntityId,
            parentTaskEntityId: task.parentTaskEntityId,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            assigneeActorEntityId: task.assigneeActorEntityId,
            assigneeName: assignee?.name ?? null,
            dueDate: task.dueDate,
            updatedAt,
          };
        }
        if (rows.length < 100) break;
        afterEntityId = rows.at(-1)!.task.entityId;
      }
    }
    return { records: records(), columns };
  });
}
