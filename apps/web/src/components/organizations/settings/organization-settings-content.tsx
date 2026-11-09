import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { SettingsPage } from "./organization-settings-view";

export function OrganizationSettings({
  picture,
  invitations,
  conversations,
  isOwner,
}: {
  picture: ReactNode;
  invitations: ReactNode;
  conversations: ReactNode;
  isOwner: boolean;
}) {
  return (
    <SettingsPage id="organization-settings">
      <Tabs defaultValue="general">
        <TabsList variant="line" aria-label="Organization settings">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          {picture}
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
