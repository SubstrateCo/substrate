import {
  BODIES,
  BODY_COLOR_NAMES,
  BODY_COLORS,
  decodeAvatarCode,
  withAvatarChoices,
  type AvatarBody,
  type BodyColorName,
} from "@substrate/agent-avatars/config";
import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ReactNode } from "react";

import { AgentAvatarView } from "@/components/agents/agent-avatar";
import { FormMessage } from "@/components/feedback/form-message";
import { SettingsSection } from "@/components/layout/settings-section";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const bodyLabels: Record<AvatarBody, string> = {
  circle: "Circle",
  squircle: "Squircle",
  pill: "Pill",
  blob: "Blob",
  drop: "Drop",
  hexagon: "Hexagon",
};

const colorLabels: Record<BodyColorName, string> = {
  slate: "Slate",
  ink: "Ink",
  ocean: "Ocean",
  teal: "Teal",
  moss: "Moss",
  lemon: "Lemon",
  sunset: "Sunset",
  rose: "Rose",
  plum: "Plum",
  clay: "Clay",
  cloud: "Cloud",
};

function ChoiceTile({
  value,
  label,
  children,
}: {
  value: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      {/* The trigger wraps the item, so the tooltip does not replace its selected state. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <ToggleGroupItem value={value} aria-label={label}>
            {children}
          </ToggleGroupItem>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ChoiceGrid<T extends string>({
  legend,
  options,
  value,
  disabled,
  onChoose,
  renderOption,
}: {
  legend: string;
  options: readonly T[];
  value: T | undefined;
  disabled: boolean;
  onChoose: (value: T) => void;
  renderOption: (value: T) => ReactNode;
}) {
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <ToggleGroup
        type="single"
        variant="tile"
        size="tile"
        spacing={2}
        className="grid grid-cols-6"
        value={value ?? ""}
        onValueChange={(next) => {
          // A single toggle group clears its value when the chosen tile is pressed again.
          const option = options.find((candidate) => candidate === next);
          if (option) onChoose(option);
        }}
      >
        {options.map(renderOption)}
      </ToggleGroup>
    </FieldSet>
  );
}

export function AgentAppearanceView({
  name,
  avatar,
  error,
  onChange,
}: {
  name: string;
  avatar: AgentAvatarCode;
  error?: Error | null;
  onChange: (avatar: AgentAvatarCode) => void;
}) {
  const look = decodeAvatarCode(avatar);
  const choose = (choice: { body?: AvatarBody; color?: BodyColorName }) => {
    const next = withAvatarChoices(avatar, choice);
    if (next && next !== avatar) onChange(next);
  };
  return (
    <SettingsSection
      title="Appearance"
      description={`How ${name} looks in messages, lists, and pickers.`}
    >
      <div className="flex min-w-0 flex-col gap-6 sm:flex-row">
        <div className="flex h-40 w-full shrink-0 items-center justify-center rounded-lg bg-inset sm:h-auto sm:w-40">
          <AgentAvatarView
            avatar={avatar}
            size="2xl"
            ambient="lively"
            interactive
            label={`${name}'s avatar`}
          />
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <ChoiceGrid<AvatarBody>
            legend="Shape"
            options={BODIES}
            value={look?.body}
            disabled={!look}
            onChoose={(body) => choose({ body })}
            renderOption={(body) => (
              <ChoiceTile key={body} value={body} label={bodyLabels[body]}>
                <AgentAvatarView
                  avatar={withAvatarChoices(avatar, { body }) ?? avatar}
                  animated={false}
                />
              </ChoiceTile>
            )}
          />
          <ChoiceGrid<BodyColorName>
            legend="Colour"
            options={BODY_COLOR_NAMES}
            value={BODY_COLOR_NAMES.find((name) => name === look?.color)}
            disabled={!look}
            onChoose={(color) => choose({ color })}
            renderOption={(color) => (
              <ChoiceTile key={color} value={color} label={colorLabels[color]}>
                <span
                  aria-hidden="true"
                  className="size-6 rounded-full bg-(--swatch) inset-ring inset-ring-foreground/15"
                  style={{ "--swatch": BODY_COLORS[color].solid }}
                />
              </ChoiceTile>
            )}
          />
          <FormMessage error={error} errorDescription="We couldn't save that change. Try again." />
        </div>
      </div>
    </SettingsSection>
  );
}
