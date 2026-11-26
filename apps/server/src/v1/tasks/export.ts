import type { ProjectExport } from "@substrate/contracts/tasks/export";

import type { ExportRecord } from "../../shared/export-types";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function exportProject(scope: WorkspaceScope, input: ProjectExport) {
  return serviceResult(async () => {
    // Read access and the first page inside serviceResult, before streaming.
    const { project, firstPage } = await scope.repositories.projects.exportStart(
      input.projectEntityId,
    );
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
      let rows = firstPage;
      for (;;) {
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
        rows = await scope.repositories.tasks.exportPage(
          project.entityId,
          rows.at(-1)!.task.entityId,
        );
      }
    }
    return { records: records(), columns };
  });
}
