import type { Ref } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { Project } from "../types";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { FolderKanban, Plus } from "lucide-react";

export function ProjectSidebar({
  projects,
  selectedId,
  loading,
  error,
  onRetry,
  onCreate,
  onSelect,
  createButtonRef,
}: {
  projects: Project[];
  selectedId?: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  createButtonRef?: Ref<HTMLButtonElement>;
}) {
  const visible = isAccessFailure(error) ? [] : projects;
  return (
    <PageSidebar aria-label="Projects">
      <PageSidebarHeader
        title="Projects"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={createButtonRef}
                size="icon-sm"
                variant="outline"
                aria-label="New project"
                onClick={onCreate}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New project</TooltipContent>
          </Tooltip>
        }
      />
      <PageSidebarContent className="pt-0">
        {loading && <LoadingState label="Loading projects" variant="compact" />}
        {error && (
          <ErrorState
            compact
            title={isAccessFailure(error) ? "Projects unavailable" : "Couldn’t load projects"}
            onRetry={onRetry}
          />
        )}
        {!loading && !error && !visible.length && (
          <p className="px-2 text-sm text-muted-foreground">
            No projects yet. Create a project to start planning.
          </p>
        )}
        <div className="flex gap-0.5 overflow-x-auto md:flex-col">
          {visible.map((project) => (
            <Tooltip key={project.entityId}>
              <TooltipTrigger asChild>
                <Button
                  variant="sidebar"
                  className="max-w-full min-w-0 shrink-0 justify-start md:w-full"
                  aria-current={selectedId === project.entityId ? "page" : undefined}
                  onClick={() => onSelect(project.entityId)}
                >
                  <FolderKanban
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{project.name}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="wrap-anywhere">
                {project.name}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </PageSidebarContent>
    </PageSidebar>
  );
}
