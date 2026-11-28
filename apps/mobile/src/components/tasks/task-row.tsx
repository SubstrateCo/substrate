import { taskPriorityValues, taskStatusValues } from "@substrate/contracts/tasks";

import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { openTask } from "@/features/records/format";
import type { ProjectActor, ProjectTask } from "@/features/records/requests";
import {
  Chip,
  DueChip,
  ListButton,
  PriorityChip,
  TaskStatusIcon,
} from "@/features/records/ui/rows";
import { cn } from "@/lib/utils";
import { CornerDownRight } from "lucide-react-native";

export type TaskTreeRow = { task: ProjectTask; depth: number; subtasks: number };

const statusRank = (task: ProjectTask) => taskStatusValues.indexOf(task.status);
const priorityRank = (task: ProjectTask) => -taskPriorityValues.indexOf(task.priority);

function compareTasks(a: ProjectTask, b: ProjectTask) {
  return (
    statusRank(a) - statusRank(b) ||
    priorityRank(a) - priorityRank(b) ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    a.title.localeCompare(b.title)
  );
}

export function taskTree(
  tasks: ProjectTask[],
  include: (task: ProjectTask) => boolean,
): TaskTreeRow[] {
  const ids = new Set(tasks.map((task) => task.entityId));
  const children = new Map<string, ProjectTask[]>();
  const roots: ProjectTask[] = [];
  for (const task of tasks) {
    const parent = task.parentTaskEntityId;
    if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), task]);
    else roots.push(task);
  }
  const rows: TaskTreeRow[] = [];
  const visit = (task: ProjectTask, depth: number, seen: Set<string>) => {
    if (seen.has(task.entityId)) return;
    seen.add(task.entityId);
    const kids = (children.get(task.entityId) ?? []).sort(compareTasks);
    if (include(task)) rows.push({ task, depth, subtasks: kids.length });
    for (const child of kids) visit(child, Math.min(depth + 1, 3), seen);
  };
  const seen = new Set<string>();
  for (const root of roots.sort(compareTasks)) visit(root, 0, seen);
  return rows;
}

export function TaskRow({
  row,
  actors,
  canEdit,
  onOpen,
  onToggleDone,
}: {
  row: TaskTreeRow;
  actors: ProjectActor[];
  canEdit: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const { task, depth, subtasks } = row;
  const assignee = actors.find((actor) => actor.entityId === task.assigneeActorEntityId);
  const done = !openTask(task.status);
  return (
    <View className="min-h-12 flex-row items-center border-b border-border">
      <View style={{ width: 16 + depth * 16 }} className="items-end">
        {depth > 0 ? <Icon as={CornerDownRight} className="size-3 text-muted-foreground" /> : null}
      </View>
      <Button
        variant="ghost"
        size="icon"
        role="checkbox"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.status === "completed", disabled: !canEdit }}
        accessibilityLabel={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        disabled={!canEdit}
        onPress={onToggleDone}
        hitSlop={8}
        className="h-12 w-10 rounded-none disabled:opacity-100"
      >
        <TaskStatusIcon status={task.status} />
      </Button>
      <ListButton
        accessibilityLabel={task.title}
        onPress={onOpen}
        className="min-h-12 flex-1 gap-2 px-0 py-2 pr-4"
      >
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className={cn("text-[15px] font-normal", done && "text-muted-foreground line-through")}
          >
            {task.title}
          </Text>
          {assignee || subtasks ? (
            <Text numberOfLines={1} className="text-xs font-normal text-muted-foreground">
              {[assignee?.name, subtasks ? `${subtasks} subtask${subtasks === 1 ? "" : "s"}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
        <PriorityChip priority={task.priority} />
        <DueChip value={task.dueDate} open={!done} />
        {task.discussionConversationId ? <Chip label="Thread" tone="outline" /> : null}
      </ListButton>
    </View>
  );
}
