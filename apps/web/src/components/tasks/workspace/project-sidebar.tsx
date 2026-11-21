import { Link, type LinkProps } from "@tanstack/react-router";

import type { Ref } from "react";

import { SkeletonText } from "../../feedback/skeleton-text";
import { Button } from "../../ui/button";
import { buttonVariants } from "../../ui/button-variants";
import { Skeleton } from "../../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { ProjectIcon } from "../projects/project-icon";
import type { Project } from "../types";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { PageSidebarErrorState } from "@/components/layout/page-sidebar-error-state";
import type { ResourceStatus } from "@/lib/resource-state";
import { cn } from "cn";
import { Plus } from "lucide-react";

export function ProjectSidebar({
  projects,
  state,
  selectedId,
  loading,
  error,
  onRetry,
  onCreate,
  onSelect,
  projectLink,
  createButtonRef,
}: {
  projects: Project[];
  state: ResourceStatus;
  selectedId?: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  projectLink: (id: string) => LinkProps;
  createButtonRef?: Ref<HTMLButtonElement>;
}) {
  const visible = projects;
  const errorState = error && (
    <PageSidebarErrorState
      title={state === "unavailable" ? "Projects unavailable" : "Couldn’t load projects"}
      unavailable={state === "unavailable"}
      onRetry={state === "unavailable" ? undefined : onRetry}
    />
  );
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
                variant="ghost"
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
      {error && !visible.length ? (
        errorState
      ) : (
        <PageSidebarContent className="pt-0">
          {loading && !visible.length && (
            <div
              role="status"
              aria-label="Loading projects"
              className="flex gap-0.5 overflow-x-auto md:flex-col"
            >
              {[96, 128, 80].map((width) => (
                <ProjectSidebarItem key={width} loading width={width} />
              ))}
            </div>
          )}
          {errorState}
          {!loading && !error && !visible.length && (
            <p className="px-2 text-sm text-muted-foreground">
              No projects yet. Create a project to start planning.
            </p>
          )}
          <div className="flex gap-0.5 overflow-x-auto md:flex-col">
            {visible.map((project) => (
              <ProjectSidebarItem
                key={project.entityId}
                project={project}
                selected={selectedId === project.entityId}
                onClick={() => onSelect(project.entityId)}
                link={projectLink(project.entityId)}
              />
            ))}
          </div>
        </PageSidebarContent>
      )}
    </PageSidebar>
  );
}

function ProjectSidebarItem(
  props:
    | { loading: true; width: number }
    | {
        loading?: false;
        project: Project;
        selected: boolean;
        onClick: () => void;
        link: LinkProps;
      },
) {
  const className = "max-w-full min-w-0 shrink-0 justify-start md:w-full";
  if (props.loading) {
    return (
      <div
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "sidebar" }), className, "pointer-events-none")}
      >
        <Skeleton className="size-4 shrink-0" />
        <span className="truncate">
          <SkeletonText width={props.width} />
        </span>
      </div>
    );
  }
  return (
    <Button asChild variant="sidebar" className={className}>
      <Link
        {...props.link}
        aria-current={props.selected ? "page" : undefined}
        onClick={props.onClick}
      >
        <ProjectIcon image={props.project.image} />
        <span className="truncate">{props.project.name}</span>
      </Link>
    </Button>
  );
}
