import type { ReactNode } from "react";

import { SettingsPage } from "../../layout/settings-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

export function OrganizationSettings({
  picture,
  invitations,
  conversations,
  isOwner,
  sharing,
}: {
  picture: ReactNode;
  invitations: ReactNode;
  conversations: ReactNode;
  isOwner: boolean;
  sharing: ReactNode;
}) {
  return (
    <SettingsPage id="organization-settings">
      <Tabs defaultValue="general">
        <TabsList variant="line" aria-label="Organization settings">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="sharing">External collaboration</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          {picture}
        </TabsContent>
        <TabsContent value="sharing" className="mt-4">
          {sharing}
        </TabsContent>
        <TabsContent value="conversations" className="mt-4">
          {conversations}
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
    </SettingsPage>
  );
}
