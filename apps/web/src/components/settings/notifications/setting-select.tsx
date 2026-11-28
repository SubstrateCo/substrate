import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format/date";
import { muteLabels, type MuteChoice, type MuteState } from "@/lib/notifications/mute";

export function SettingSelect<T extends string>({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger id={id} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const timedMute = "until";

export function MuteSelect({
  id,
  state,
  choices,
  disabled,
  onChange,
}: {
  id: string;
  state: MuteState;
  choices: readonly MuteChoice[];
  disabled?: boolean;
  onChange: (choice: MuteChoice) => void;
}) {
  const options: { value: MuteChoice | typeof timedMute; label: string }[] = choices.map(
    (choice) => ({ value: choice, label: muteLabels[choice] }),
  );
  if (state.kind === "until")
    options.splice(1, 0, { value: timedMute, label: `Until ${formatDateTime(state.until)}` });
  return (
    <SettingSelect
      id={id}
      value={state.kind}
      options={options}
      disabled={disabled}
      onChange={(value) => {
        if (value !== timedMute) onChange(value);
      }}
    />
  );
}
