import { AgentForm } from "./editors/agent-form";
import { useAgentFieldRenderers } from "./editors/use-agent-field-renderers";
import { FormDialog } from "@/components/feedback/form-dialog";
import { useFocusReturn } from "@/components/feedback/use-focus-return";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useAgentMutations } from "@/queries/agents/mutations";
import { toast } from "sonner";

/** The New agent dialog. A new agent opens in its own page. */
export function NewAgentDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { userId } = useWorkspaceScope();
  const { save } = useAgentMutations(userId);
  const createFocus = useFocusReturn();
  const renderers = useAgentFieldRenderers();
  return (
    <AgentForm
      {...renderers}
      pending={save.isPending}
      error={save.variables && !save.variables.id ? save.error : null}
      onResetError={() => save.reset()}
      renderCreate={({ fields, ...editor }) => (
        <FormDialog
          {...editor}
          title="New agent"
          description="An agent answers your messages and helps in conversations you add it to. It runs on your desktop, and you can change everything later."
          saveLabel="Create agent"
          size="lg"
          onClose={onClose}
          onRestoreFocus={createFocus.restore}
        >
          {fields}
        </FormDialog>
      )}
      onSave={(input, options) =>
        save.mutate(input, {
          onSuccess: (saved) => {
            toast.success("Agent created.");
            options.onSuccess();
            onCreated(saved.id);
          },
        })
      }
    />
  );
}
