import { permissionLabels } from "@substrate/contracts/access/levels";

import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";

import { ProjectForm } from "./project-form";
import { ProjectIcon } from "./project-icon";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceApps } from "@/features/records/apps";
import { recordQueries, useRecordScope, useTasksWrite } from "@/features/records/queries";
import type { ProjectSummary } from "@/features/records/requests";
import type { OnOpenRecord, WorkspaceScreenProps } from "@/features/records/types";
import { ListToolbar, SearchBar } from "@/features/records/ui/layout";
import { Chip, Row, Segments, SectionHeader } from "@/features/records/ui/rows";
import { EmptyState, ErrorState, LoadingRows } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { Archive, FolderKanban, Plus } from "lucide-react-native";

type ProjectView = "active" | "archived";
type Section = { title: string; data: ProjectSummary[] };

export function TasksScreen({ organizationId, onOpenRecord }: WorkspaceScreenProps) {
  const scope = useRecordScope(organizationId);
  const apps = useWorkspaceApps(scope);
  if (apps.query.isPending) return <LoadingRows label="Loading tasks" />;
  if (apps.query.isError)
    return (
      <ErrorState
        error={apps.query.error}
        noun="workspace apps"
        onRetry={() => void apps.query.refetch()}
      />
    );
  if (!apps.enabled("tasks"))
    return (
      <EmptyState
        icon={FolderKanban}
        title="Tasks is turned off"
        description="A workspace admin can turn on Tasks in workspace settings."
      />
    );
  return <EnabledTasks organizationId={organizationId} onOpenRecord={onOpenRecord} />;
}

function EnabledTasks({ organizationId, onOpenRecord }: WorkspaceScreenProps) {
  const scope = useRecordScope(organizationId);
  const [view, setView] = useState<ProjectView>("active");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const projects = useQuery(recordQueries.projects(scope, view));
  const write = useTasksWrite(scope);

  const sections = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (text: string) => !term || text.toLowerCase().includes(term);
    const list = (projects.data ?? []).filter((project) => matches(project.name));
    return [
      {
        title: view === "active" ? "Projects" : "Archived projects",
        data: list,
      },
    ];
  }, [projects.data, search, view]);

  return (
    <View className="flex-1 bg-surface" testID="tasks-screen">
      <ListToolbar title="Tasks">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setCreating(true)}
          accessibilityLabel="New project"
          testID="new-project"
        >
          <Icon as={Plus} className="size-5 text-foreground" />
        </Button>
      </ListToolbar>
      <Segments
        label="Project list"
        value={view}
        onChange={setView}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />
      <SearchBar value={search} onChange={setSearch} placeholder="Filter projects" />
      {projects.isPending ? <LoadingRows label="Loading projects" /> : null}
      {projects.isError ? (
        <ErrorState
          error={projects.error}
          noun="projects"
          onRetry={() => void projects.refetch()}
        />
      ) : null}
      {projects.isSuccess ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.entityId}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={projects.isRefetching}
              onRefresh={() => void projects.refetch()}
            />
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} count={section.data.length || undefined} />
          )}
          renderSectionFooter={({ section }) => (
            <SectionFooter
              section={section}
              view={view}
              search={search}
              onCreate={() => setCreating(true)}
            />
          )}
          renderItem={({ item }) => (
            <ItemRow project={item} scope={scope} onOpenRecord={onOpenRecord} />
          )}
        />
      ) : null}
      {creating ? (
        <ProjectForm
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setCreating(false);
          }}
          onSubmit={(value) =>
            write.mutate(
              { action: "createProject", ...value },
              {
                onSuccess: (result) => {
                  setCreating(false);
                  onOpenRecord({ kind: "project", id: result.id });
                },
              },
            )
          }
        />
      ) : null}
    </View>
  );
}

function emptyTitle(view: ProjectView, search: string) {
  if (search) return "No projects match";
  return view === "archived" ? "No archived projects" : "No projects yet";
}

function SectionFooter({
  section,
  view,
  search,
  onCreate,
}: {
  section: Section;
  view: ProjectView;
  search: string;
  onCreate: () => void;
}) {
  if (section.data.length) return null;
  const invite = view === "active" && !search;
  return (
    <EmptyState
      icon={view === "archived" ? Archive : FolderKanban}
      title={emptyTitle(view, search)}
      description={
        invite
          ? "Create a project to start tracking tasks. Projects you're added to appear here."
          : undefined
      }
      action={
        invite ? (
          <Button size="sm" onPress={onCreate}>
            <Text>New project</Text>
          </Button>
        ) : undefined
      }
    />
  );
}

function ItemRow({
  project,
  scope,
  onOpenRecord,
}: {
  project: ProjectSummary;
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
}) {
  return (
    <Row
      title={project.name}
      subtitle={project.description || undefined}
      leading={<ProjectIcon image={project.image} scope={scope} />}
      trailing={
        project.archivedAt ? (
          <Chip
            label={project.level ? permissionLabels[project.level] : "Archived"}
            tone="outline"
          />
        ) : undefined
      }
      chevron
      onPress={() => onOpenRecord({ kind: "project", id: project.entityId })}
      testID={`project-${project.entityId}`}
    />
  );
}
