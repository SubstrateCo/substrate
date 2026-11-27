import {
  areHotkeysEqual,
  useAppHotkeyList,
  useCustomHotkeys,
  useHotkeyRecorder,
  type Hotkey,
  type RegisteredAppHotkeyListItem,
} from "@tanstack/react-hotkeys";

import { useState } from "react";

import { GroupTitle, SettingsCard, SettingsRow } from "@/components/layout/settings-section";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { hotkeySteps, useShortcutLabel } from "@/components/shortcuts/use-shortcut";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { desktopSettingsBridge } from "@/lib/desktop/bridges";
import { RotateCcw } from "lucide-react";

// Keys that other parts of the app keep: switching the search type.
const reserved = ["Control+Tab", "Control+Shift+Tab"] as const;
const usesReservedKey = (hotkey: Hotkey) =>
  hotkeySteps(hotkey).some((step) => reserved.some((key) => areHotkeysEqual(step, key)));

// Only the desktop app saves shortcuts. Browsers use the defaults and show nothing.
export function KeyboardShortcutsSettings() {
  const items = useAppHotkeyList();
  const { resetCustomHotkeys } = useCustomHotkeys();
  if (!desktopSettingsBridge()) return null;
  return (
    <SettingsCard label="Keyboard shortcuts">
      <GroupTitle
        title="Keyboard shortcuts"
        description="Select Change, then press up to two keys, such as G then H, or one combination, such as Ctrl+K. Press Escape to cancel."
        actions={
          items.some((item) => item.isCustom) && (
            <Button type="button" variant="outline" size="sm" onClick={resetCustomHotkeys}>
              Reset all
            </Button>
          )
        }
      />
      {items.map((item) => (
        <ShortcutRow key={item.appHotkey.id} item={item} />
      ))}
    </SettingsCard>
  );
}

function ShortcutRow({ item: { appHotkey, isCustom } }: { item: RegisteredAppHotkeyListItem }) {
  const { setCustomHotkey, resetCustomHotkey, findConflicts } = useCustomHotkeys();
  const label = useShortcutLabel();
  const [error, setError] = useState<string>();
  const name = appHotkey.meta?.name ?? appHotkey.id;
  const recorder = useHotkeyRecorder({
    maxSteps: 2,
    // A single combination commits after a short pause; a second key commits at once.
    idleTimeoutMs: 1000,
    validate: (hotkey, context) => {
      if (usesReservedKey(hotkey)) return `${label(hotkey)} is used elsewhere in Substrate.`;
      const conflict = findConflicts(appHotkey.id, hotkey, context).at(0);
      return conflict ? `${label(hotkey)} is already used by ${conflict.meta?.name}.` : true;
    },
    onReject: (rejection) => {
      if (rejection.reason !== "validation") return;
      setError(rejection.message);
      recorder.stopRecording();
    },
    onRecord: (hotkey, context) => {
      setError(undefined);
      setCustomHotkey(appHotkey.id, hotkey, context);
    },
    onCancel: () => setError(undefined),
  });
  const current = appHotkey.hotkey;
  return (
    <SettingsRow
      label={name}
      description={
        error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : undefined
      }
      control={
        <ShortcutControl
          name={name}
          recording={
            recorder.isRecording
              ? {
                  keys: recorder.steps.length > 0 ? label(recorder.steps) : undefined,
                  onCancel: recorder.cancelRecording,
                }
              : undefined
          }
          current={current}
          currentLabel={current ? label(current) : undefined}
          custom={isCustom}
          onChange={() => {
            setError(undefined);
            recorder.startRecording();
          }}
          onReset={() => {
            setError(undefined);
            resetCustomHotkey(appHotkey.id);
          }}
        />
      }
    />
  );
}

/** While recording, the keys pressed so far and Cancel; otherwise the shortcut and its tools. */
function ShortcutControl({
  name,
  recording,
  current,
  currentLabel,
  custom,
  onChange,
  onReset,
}: {
  name: string;
  recording?: { keys?: string; onCancel: () => void };
  current: RegisteredAppHotkeyListItem["appHotkey"]["hotkey"];
  currentLabel?: string;
  custom: boolean;
  onChange: () => void;
  onReset: () => void;
}) {
  if (recording)
    return (
      <div className="flex items-center gap-2">
        <span role="status" className="text-sm text-muted-foreground">
          {recording.keys ?? "Press keys…"}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={recording.onCancel}>
          Cancel
        </Button>
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      {current && <ShortcutKeys hotkey={current} />}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Change ${name} shortcut${currentLabel ? `, now ${currentLabel}` : ""}`}
        onClick={onChange}
      >
        Change
      </Button>
      {custom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Reset ${name} shortcut`}
              onClick={onReset}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset to default</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
