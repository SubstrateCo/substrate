import type { ReactNode } from "react";

import { SettingsPage } from "../organizations/settings/organization-settings-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export function UserSettingsLayout({
  children,
  active,
  onTabChange,
}: {
  children: ReactNode;
  active: "profile" | "invitations" | "agents";
  onTabChange: (tab: "profile" | "invitations" | "agents") => void;
}) {
  return (
    <SettingsPage id="user-settings" title="User settings">
      <Tabs
        value={active}
        onValueChange={(value) => {
          if (value === "profile" || value === "invitations" || value === "agents")
            onTabChange(value);
        }}
      >
        <TabsList variant="line" aria-label="User settings" className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="profile">Profile and appearance</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          {active === "profile" && children}
        </TabsContent>
        <TabsContent value="invitations" className="mt-6">
          {active === "invitations" && children}
        </TabsContent>
        <TabsContent value="agents" className="mt-6">
          {active === "agents" && children}
        </TabsContent>
      </Tabs>
    </SettingsPage>
  );
}
