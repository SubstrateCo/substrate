import type { ReactNode } from "react";

import { GroupTitle, SettingsCard, SettingsSection } from "@/components/layout/settings-section";

export function GeneralSettingsLayout({
  profile,
  model,
  footer,
  disabled,
  deleteAction,
}: {
  profile: ReactNode;
  model: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  deleteAction?: ReactNode;
}) {
  return (
    <SettingsSection
      title="General"
      description="How this agent appears in Substrate and which model it uses."
    >
      <SettingsCard label="Agent details" footer={footer}>
        <fieldset
          disabled={disabled}
          className="grid min-w-0 gap-x-8 gap-y-8 @2xl/content:grid-cols-2"
        >
          <section aria-label="Profile" className="grid min-w-0 content-start gap-4">
            <GroupTitle title="Profile" />
            {profile}
          </section>
          <section
            aria-label="Model"
            className="grid min-w-0 content-start gap-4 @2xl/content:border-l @2xl/content:pl-8"
          >
            <GroupTitle
              title="Model"
              description="It runs on this agent’s desktop with the tools installed there."
            />
            {model}
          </section>
        </fieldset>
      </SettingsCard>
      {deleteAction}
    </SettingsSection>
  );
}

export function InstructionsSettingsLayout({
  children,
  footer,
  disabled,
}: {
  children: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <SettingsSection title="Instructions" description="Tell this agent its role, tone, and limits.">
      <SettingsCard label="Agent instructions" footer={footer}>
        <fieldset disabled={disabled} className="min-w-0">
          {children}
        </fieldset>
      </SettingsCard>
    </SettingsSection>
  );
}
