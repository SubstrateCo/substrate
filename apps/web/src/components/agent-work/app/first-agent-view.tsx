import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Bot, Laptop, MessageCircle, Plus, type LucideIcon } from "lucide-react";

const steps: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Bot,
    title: "Name it and pick a model",
    description: "Say what it should help with. You can change everything later.",
  },
  {
    icon: Laptop,
    title: "Run it on your desktop",
    description: "It works through the Substrate desktop app, with the tools you already use.",
  },
  {
    icon: MessageCircle,
    title: "Send it a message",
    description: "Message it directly or add it to a conversation. Its questions show up here.",
  },
];

/** The Agents app before the owner has any agent: what an agent does and how to start. */
export function FirstAgentView({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto grid w-full max-w-4xl gap-8">
        <div className="grid justify-items-start gap-5">
          <span className="grid size-11 place-items-center rounded-lg bg-muted text-foreground">
            <Bot aria-hidden="true" className="size-5" />
          </span>
          <PageHeader
            title="Create your first agent"
            description="An agent works for you in Substrate. It answers your messages, helps in conversations you add it to, and runs routines on a schedule. Anything beyond a reply waits for your approval."
          />
          <Button type="button" onClick={onCreate}>
            <Plus aria-hidden="true" />
            New agent
          </Button>
        </div>
        <ol aria-label="How agents work" className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="grid content-start gap-2 rounded-xl border bg-card p-4">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <step.icon aria-hidden="true" className="size-4" />
                Step {index + 1}
              </span>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
