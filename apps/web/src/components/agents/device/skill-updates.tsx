import {
  skillUpdateFrequencySchema,
  type SkillPackages,
  type SkillUpdateFrequency,
} from "@substrate/contracts/harness-runtime";

import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { GroupTitle, SettingsRow } from "@/components/layout/settings-section";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Laptop, RefreshCw } from "lucide-react";

export function SkillUpdates({
  state,
  available,
  loading,
  busy,
  saving,
  updating,
  hasSkills,
  onFrequency,
  onUpdate,
  onRetry,
}: {
  state?: SkillPackages["updates"];
  available: boolean;
  loading: boolean;
  busy: boolean;
  saving: boolean;
  updating: boolean;
  hasSkills: boolean;
  onFrequency: (value: SkillUpdateFrequency) => void;
  onUpdate: () => void;
  onRetry: () => void;
}) {
  if (!available)
    return (
      <ContentNotice
        variant="compact"
        icon={Laptop}
        title="Updates run on the home desktop"
        description="Open this agent there to change its schedule or update its skills."
      />
    );
  if (loading) return <ContentNotice variant="inline" title="Reading update settings…" />;
  if (!state)
    return (
      <ContentNotice
        variant="compact"
        tone="error"
        title="Could not read update settings"
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  return (
    <section aria-label="Skill updates" className="grid min-w-0 gap-6">
      <GroupTitle
        title="Automatic updates"
        description="Choose how often to update skills from the catalog."
      />
      <div className="divide-y border-y">
        <SettingsRow
          label="Update frequency"
          description="Updates wait until this agent is idle."
          control={
            <Select
              value={state.frequency}
              disabled={busy || saving}
              onValueChange={(value) => onFrequency(skillUpdateFrequencySchema.parse(value))}
            >
              <SelectTrigger aria-label="Skill update frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label="Last updated"
          description={
            state.lastSuccessAt ? (
              <Timestamp value={new Date(state.lastSuccessAt).toISOString()} />
            ) : (
              "No updates run yet."
            )
          }
          control={
            <PendingButton
              variant="outline"
              size="sm"
              pending={updating}
              disabled={busy || !hasSkills}
              onClick={onUpdate}
            >
              <RefreshCw /> Update now
            </PendingButton>
          }
        />
      </div>
      {state.error && <ContentNotice variant="inline" tone="error" title={state.error} />}
      <p className="text-sm text-muted-foreground">
        Custom skills are never changed. Built-in skills update with Substrate.
      </p>
      <p className="text-xs text-muted-foreground">
        Changes save automatically. Missed updates run when this desktop is back online.
      </p>
    </section>
  );
}
