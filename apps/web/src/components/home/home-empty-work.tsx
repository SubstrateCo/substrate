import { Link } from "@tanstack/react-router";

import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { ArrowRight, ListTodo } from "lucide-react";

export function HomeEmptyWork() {
  const { organizationId } = useWorkspaceScope();
  const search = { workspaceId: organizationId };
  return (
    <ContentNotice
      variant="compact"
      icon={ListTodo}
      title="No open tasks assigned to you"
      action={
        <Button variant="outline" size="sm" asChild>
          <Link to="/tasks" search={search}>
            Browse tasks <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      }
    />
  );
}
