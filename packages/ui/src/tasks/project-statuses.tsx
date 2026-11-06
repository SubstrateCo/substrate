import { useId, useState } from "react";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { Spinner } from "../primitives/spinner";
import { FormMessage } from "../auth/form-message";
import type { ProjectDetail, TaskStatus } from "./types";
import { TaskSelect } from "./task-select";

export function ProjectStatuses({
  detail,
  pending = false,
  error,
  onAdd,
}: {
  detail: ProjectDetail;
  pending?: boolean;
  error?: Error | null;
  onAdd: (draft: { name: string; category: TaskStatus["category"] }, onSuccess: () => void) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TaskStatus["category"]>("active");
  return (
    <section className="min-w-0 space-y-4 rounded-xl border p-4" aria-label="Project statuses">
      <h2 className="font-semibold">Workflow statuses</h2>
      <ul className="space-y-1 text-sm">
        {detail.statuses.map((status) => (
          <li key={status.id} className="wrap-anywhere">
            {status.name} <span className="text-muted-foreground">· {status.category}</span>
          </li>
        ))}
      </ul>
      {(detail.level === "edit" || detail.level === "owner") && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) onAdd({ name, category }, () => setName(""));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={id}>New status name</Label>
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
          </div>
          <TaskSelect
            label="Status category"
            value={category}
            onChange={setCategory}
            options={[
              { value: "todo", label: "Todo" },
              { value: "active", label: "Active" },
              { value: "done", label: "Done" },
              { value: "canceled", label: "Canceled" },
            ]}
          />
          <FormMessage error={error} />
          <Button disabled={pending || !name.trim()}>
            {pending && <Spinner />}
            {pending ? "Adding status…" : "Add status"}
          </Button>
        </form>
      )}
    </section>
  );
}
