import { type HarnessMcpServer } from "@substrate/contracts/harness";

import { McpServerEditor } from "../editors/mcp-server-editor";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useAgentConfigurationMutations } from "@/queries/agents/configuration-mutations";
import { toast } from "sonner";

type ConfigurationMutations = ReturnType<typeof useAgentConfigurationMutations>;

/** The editor and the delete prompt for the agent's own MCP servers. */
export function McpServerDialogs({
  editing,
  deleting,
  servers,
  saveServer,
  removeServer,
  onRestoreFocus,
  onEditDone,
  onDeleteDone,
}: {
  /** The server being edited, or an empty object for a new one. */
  editing?: { server?: HarnessMcpServer };
  deleting?: HarnessMcpServer;
  servers: readonly HarnessMcpServer[];
  saveServer: ConfigurationMutations["saveServer"];
  removeServer: ConfigurationMutations["removeServer"];
  onRestoreFocus: () => void;
  onEditDone: () => void;
  onDeleteDone: () => void;
}) {
  return (
    <>
      {editing && (
        <McpServerEditor
          server={editing.server}
          servers={servers}
          pending={saveServer.isPending}
          error={saveServer.error}
          onRestoreFocus={onRestoreFocus}
          onClose={() => {
            onEditDone();
            saveServer.reset();
          }}
          onSave={(server) =>
            saveServer.mutate(server, {
              onSuccess: () => {
                toast.success(editing.server ? "Server saved." : "Server added.");
                onEditDone();
              },
            })
          }
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="This removes the server from this agent on this desktop. New sessions won’t use it. You can’t undo this."
          confirmLabel="Delete server"
          errorDescription="We couldn’t delete this server. Try again."
          destructive
          pending={removeServer.isPending}
          error={removeServer.error}
          onRestoreFocus={onRestoreFocus}
          onConfirm={() =>
            removeServer.mutate(deleting.id, {
              onSuccess: () => {
                toast.success("Server deleted.");
                onDeleteDone();
              },
            })
          }
          onClose={() => {
            onDeleteDone();
            removeServer.reset();
          }}
        />
      )}
    </>
  );
}
