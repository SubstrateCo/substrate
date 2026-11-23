import { Link, type LinkProps } from "@tanstack/react-router";

import { useState, type Ref } from "react";

import { SkeletonText } from "../../feedback/skeleton-text";
import { Button } from "../../ui/button";
import { buttonVariants } from "../../ui/button-variants";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
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
import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import type { ResourceStatus } from "@/lib/resource-state";
import { cn } from "cn";
import { ChevronDown, Plus, RotateCcw } from "lucide-react";

export function ProjectSidebar({
  projects,
  archivedProjects = [],
  state,
  selectedId,
  loading,
  error,
  onRetry,
  onCreate,
  onSelect,
  onRestore,
  restoringId,
  projectLink,
  createButtonRef,
}: {
  projects: Project[];
  /** Archived projects the reader can open; each carries the reader's level. */
  archivedProjects?: Project[];
  state: ResourceStatus;
  selectedId?: string;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRestore?: (id: string) => void;
  restoringId?: string;
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
              {archivedProjects.length
                ? "No active projects. Create a project to start planning."
                : "No projects yet. Create a project to start planning."}
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
          {archivedProjects.length > 0 && (
            <ArchivedProjects
              projects={archivedProjects}
              selectedId={selectedId}
              onSelect={onSelect}
              onRestore={onRestore}
              restoringId={restoringId}
              projectLink={projectLink}
            />
          )}
        </PageSidebarContent>
      )}
    </PageSidebar>
  );
}

function ArchivedProjects({
  projects,
  selectedId,
  onSelect,
  onRestore,
  restoringId,
  projectLink,
}: {
  projects: Project[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRestore?: (id: string) => void;
  restoringId?: string;
  projectLink: (id: string) => LinkProps;
}) {
  const containsSelected = projects.some((project) => project.entityId === selectedId);
  const [open, setOpen] = useState(containsSelected);
  // The group opens when it holds the selected project: after a deep link to an archived project,
  // or after archiving the open one. Closing it afterwards keeps it closed.
  const [openedFor, setOpenedFor] = useState(containsSelected ? selectedId : undefined);
  if (containsSelected && openedFor !== selectedId) {
    setOpenedFor(selectedId);
    setOpen(true);
  } else if (!containsSelected && openedFor) setOpenedFor(undefined);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section aria-label="Archived projects" className="group/archived mt-4 space-y-1">
        <h3 className="flex h-7 items-center px-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" className="-ml-2">
              Archived
              <span className="font-normal tabular-nums">{projects.length}</span>
              <ChevronDown
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=closed]/archived:-rotate-90"
              />
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent>
          <div className="flex flex-col gap-0.5">
            {projects.map((project) => (
              <div key={project.entityId} className={cn(actionRow, "flex min-w-0 items-center")}>
                <ProjectSidebarItem
                  project={project}
                  selected={selectedId === project.entityId}
                  onClick={() => onSelect(project.entityId)}
                  link={projectLink(project.entityId)}
                  fill
                />
                {onRestore && project.level === "owner" && (
                  <RowActions label={`Actions for ${project.name}`} className="pr-1">
                    <RowAction
                      label={`Restore ${project.name}`}
                      disabled={restoringId === project.entityId}
                      onClick={() => onRestore(project.entityId)}
                    >
                      <RotateCcw aria-hidden="true" />
                    </RowAction>
                  </RowActions>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
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
        /** Fills the row beside its row actions. */
        fill?: boolean;
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
    <Button asChild variant="sidebar" className={cn(className, props.fill && "flex-1 shrink")}>
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
