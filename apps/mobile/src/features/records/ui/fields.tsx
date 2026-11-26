import { useId, useState, type ComponentProps } from "react";
import { View } from "react-native";

import { validDate } from "../format";
import { PickerSheet, type Choice } from "./sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react-native";

function FieldFrame({
  label,
  nativeID,
  description,
  error,
  children,
}: {
  label: string;
  nativeID: string;
  description?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Label nativeID={nativeID}>{label}</Label>
      {children}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      {description && !error ? (
        <Text className="text-xs text-muted-foreground">{description}</Text>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  description,
  error,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChangeText" | "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  description?: string;
  error?: string | null;
}) {
  const id = useId();
  const Control = multiline ? Textarea : Input;
  return (
    <FieldFrame label={label} nativeID={id} description={description} error={error}>
      <Control
        {...props}
        value={value}
        onChangeText={onChange}
        aria-labelledby={id}
        accessibilityLabel={label}
        className={cn(multiline && "min-h-24", error && "border-destructive", props.className)}
      />
    </FieldFrame>
  );
}

/** A calendar date typed as YYYY-MM-DD. An empty value means no date. */
export function DateField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}) {
  const invalid = value !== "" && !validDate(value);
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
      autoCorrect={false}
      maxLength={10}
      description={description ?? "Leave empty for no date."}
      error={invalid ? "Use a real date, like 2026-12-31." : null}
    />
  );
}

export const dateFieldValid = (value: string) => value === "" || validDate(value);

export function SelectField<T extends string>({
  label,
  value,
  choices,
  onChange,
  placeholder = "Choose",
  disabled = false,
  searchable,
  description,
  search,
  onSearch,
  loading,
}: {
  label: string;
  value: T | null;
  choices: Choice<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  description?: string;
  search?: string;
  onSearch?: (value: string) => void;
  loading?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = choices.find((choice) => choice.value === value);
  return (
    <FieldFrame label={label} nativeID={id} description={description}>
      <Button
        variant="outline"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="justify-start px-3"
      >
        <Text
          className={cn("flex-1 text-base font-normal", !selected && "text-muted-foreground")}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon as={ChevronsUpDown} className="size-4 text-muted-foreground" />
      </Button>
      {open ? (
        <PickerSheet
          title={label}
          choices={choices}
          value={value}
          onSelect={onChange}
          onClose={() => setOpen(false)}
          searchable={searchable ?? choices.length > 8}
          search={search}
          onSearch={onSearch}
          loading={loading}
        />
      ) : null}
    </FieldFrame>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <View className="flex-row items-start gap-3 rounded-md border border-border p-3">
      <View className="flex-1 gap-1">
        <Label nativeID={id} onPress={() => onChange(!checked)} className="font-normal">
          {label}
        </Label>
        {description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}
      </View>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby={id}
        accessibilityLabel={label}
      />
    </View>
  );
}
