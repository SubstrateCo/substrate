import { Link } from "@tanstack/react-router";

import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { ArrowRight, Bot, ListTodo, MessageCircle } from "lucide-react";

export function HomeEmptyWork() {
  const { organizationId } = useWorkspaceScope();
  const search = { workspaceId: organizationId };
  return (
    <div className="space-y-6 py-3">
      <ContentNotice
        variant="compact"
        icon={ListTodo}
        title="No open tasks assigned to you"
        description="Find work in your projects, or create a task and assign it to yourself."
        action={
          <Button variant="outline" asChild>
            <Link to="/tasks" search={search}>
              Browse tasks <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <Button variant="outline" size="selection" className="justify-start text-left" asChild>
          <Link to="/messages" search={search}>
            <span className="flex items-center gap-3">
              <MessageCircle aria-hidden="true" />
              <span className="min-w-0 whitespace-normal">
                <span className="block">Start with a conversation</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Turn a discussion into a task
                </span>
              </span>
            </span>
          </Link>
        </Button>
        <Button variant="outline" size="selection" className="justify-start text-left" asChild>
          <Link to="/agents" search={search}>
            <span className="flex items-center gap-3">
              <Bot aria-hidden="true" />
              <span className="min-w-0 whitespace-normal">
                <span className="block">Delegate to an agent</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Choose an agent and give it work
                </span>
              </span>
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
