import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { WorkspaceSettings } from "./organization-settings-view";

export function OrganizationSettings({
  picture,
  invitations,
  isOwner,
}: {
  picture: ReactNode;
  invitations: ReactNode;
  isOwner: boolean;
}) {
  return (
    <WorkspaceSettings>
      <Tabs defaultValue="general">
        <TabsList variant="line" aria-label="Organization settings">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          {picture}
        </TabsContent>
        <TabsContent value="invitations" className="mt-4">
          {isOwner ? (
            invitations
          ) : (
            <p className="text-sm text-muted-foreground">
              Only organization owners can send and manage invitations.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </WorkspaceSettings>
  );
}
