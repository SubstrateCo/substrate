import {
  TaskFilterLayout,
  TaskGroupHeaderLayout,
  taskRowAssigneeClassName,
  taskRowClassName,
  taskRowContentClassName,
  taskRowDueDateClassName,
} from "../list/task-list-layout";
import { ProjectHeaderLayout, ProjectTabLayout } from "./project-layout";
import { projectTabs } from "./project-tabs";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const rows = [48, 64, 40, 56, 72];

export function ProjectLoading() {
  return (
    <div
      role="status"
      aria-label="Loading project"
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        <ProjectHeaderLayout>
          <PageHeader
            title={
              <span className="inline-flex items-center gap-2">
                <span className="text-2xl">
                  <SkeletonText width="1.5rem" />
                </span>
                <SkeletonText width="12rem" />
              </span>
            }
          />
          <ProjectTabLayout>
            <div className="-ml-1.5 flex h-8 items-center gap-1 p-0.75 text-sm font-medium text-muted-foreground">
              {projectTabs.map(({ value, label }) => (
                <span key={value} className="px-1.5">
                  {label}
                </span>
              ))}
            </div>
          </ProjectTabLayout>
        </ProjectHeaderLayout>
        <section className="@container flex min-h-0 min-w-0 flex-1 flex-col">
          <TaskFilterLayout>
            <Skeleton className="h-9 w-52" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-28" />
          </TaskFilterLayout>
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <TaskGroupHeaderLayout>
              <Skeleton className="ml-6 size-4" />
              <span className="text-sm">
                <SkeletonText width="6rem" />
              </span>
            </TaskGroupHeaderLayout>
            <ul>
              {rows.map((width) => (
                <li key={width} className={taskRowClassName}>
                  <Skeleton className="size-4 shrink-0" />
                  <div className={taskRowContentClassName}>
                    <span className="min-w-0 flex-1">
                      <SkeletonText width={`${width}%`} />
                    </span>
                    <Skeleton className="size-5 shrink-0" />
                    <span className={taskRowDueDateClassName}>
                      <SkeletonText width="3rem" />
                    </span>
                  </div>
                  <div className={taskRowAssigneeClassName}>
                    <div className="size-6 overflow-hidden rounded-full">
                      <Skeleton className="size-full" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
