import type { HarnessKind, HarnessModel } from "@substrate/contracts/harness";

import { useQueries } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { HarnessIcon } from "./harness-icon";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { harnessLabel, harnessOptions } from "@/lib/agents/harness-meta";
import { harnessModelsQueryOptions } from "@/queries/agents/models";
import { Check, ChevronsUpDown, CircleAlert, Laptop, RefreshCw } from "lucide-react";

type Choice = HarnessModel & { harness: HarnessKind; saved?: boolean };

const defaultModelLabel = "Default model";

/** A short state inside the picker body, such as "Open the desktop app". */
function PickerNote({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 border-t px-3 py-3 text-xs text-muted-foreground [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <div className="grid min-w-0 flex-1 gap-2">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

// T3 Code's grouped model rows, adapted to our native bridge and UI primitives.
// Source: pingdotgg/t3code/apps/web/src/components/chat (MIT, icons/LICENSE).
export function ModelPicker({
  id,
  userId,
  organizationId,
  agentId,
  harness,
  model,
  disabled,
  onChange,
}: {
  id?: string;
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  harness: HarnessKind;
  model?: string;
  disabled: boolean;
  onChange: (harness: HarnessKind, model: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedHarness, setSelectedHarness] = useState<HarnessKind>(harness);
  const [search, setSearch] = useState("");
  const available = !!window.substrateHarness && !!organizationId;
  const query = search.trim();
  const catalogs = useQueries({
    queries: harnessOptions.map((option) => ({
      ...harnessModelsQueryOptions(userId, organizationId ?? "", option.value, agentId),
      enabled: open && available && (!!query || option.value === selectedHarness),
    })),
  });
  const choices: Choice[] = harnessOptions.flatMap((option, index) =>
    (catalogs[index]?.data?.models ?? []).map((item) => ({ ...item, harness: option.value })),
  );
  if (model && !choices.some((choice) => choice.harness === harness && choice.id === model))
    choices.push({ id: model, name: model, harness, saved: true });
  const activeModel = choices.find((choice) => choice.harness === harness && choice.id === model);
  const modelName = activeModel?.name ?? defaultModelLabel;
  const label = harnessLabel(harness);
  const selectedLabel = harnessLabel(selectedHarness);
  const selectedIndex = harnessOptions.findIndex((option) => option.value === selectedHarness);
  const selectedCatalog = catalogs[selectedIndex];
  const groups = harnessOptions.filter((option) => query || selectedHarness === option.value);
  const customAllowed =
    query.length > 0 && (selectedHarness !== "opencode" || /^[^/\s]+\/\S+$/.test(query));
  const refreshing = catalogs.some((catalog) => catalog.isFetching);
  function key(choice: Choice) {
    return `${choice.harness}/${choice.id}`;
  }
  function select(nextHarness: HarnessKind, id: string) {
    onChange(nextHarness, id || undefined);
    setOpen(false);
  }
  function chooseHarness(value: HarnessKind) {
    setSelectedHarness(value);
    setSearch("");
  }
  function refresh() {
    catalogs.forEach((catalog, index) => {
      if (query || harnessOptions[index]!.value === selectedHarness) void catalog.refetch();
    });
  }
  let note: ReactNode = null;
  if (!available)
    note = (
      <PickerNote icon={<Laptop aria-hidden="true" />}>
        Open Substrate on your desktop to see {selectedLabel}’s models. Until then, the agent uses
        the default model.
      </PickerNote>
    );
  else if (selectedCatalog.error)
    note = (
      <PickerNote
        icon={<CircleAlert aria-hidden="true" className="text-destructive" />}
        action={
          <Button type="button" size="xs" variant="outline" className="w-fit" onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        }
      >
        <span role="alert">We couldn’t load {selectedLabel}’s models.</span>
      </PickerNote>
    );
  else if (selectedCatalog.data?.status === "unavailable")
    note = (
      <PickerNote icon={<Laptop aria-hidden="true" />}>
        {selectedLabel} isn’t installed on this desktop. Install it, then refresh.
      </PickerNote>
    );
  else if (selectedCatalog.isPending && selectedCatalog.fetchStatus === "fetching")
    note = (
      <PickerNote icon={<Spinner aria-hidden="true" />}>Loading {selectedLabel} models…</PickerNote>
    );
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) chooseHarness(harness);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="selection"
          disabled={disabled}
          aria-label={`Model: ${modelName}, ${label}`}
          className="w-full justify-start text-left"
        >
          <HarnessIcon harness={harness} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate">{modelName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{label}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        variant="reference"
        align="start"
        side="bottom"
        collisionPadding={8}
        className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-88"
        aria-label="Choose a model"
      >
        <div className="border-b p-2">
          <SegmentedControl
            aria-label="Runtime"
            value={selectedHarness}
            options={harnessOptions}
            onValueChange={chooseHarness}
          />
        </div>
        <Command
          key={`${open}/${selectedHarness}`}
          className="min-h-0 flex-1"
          defaultValue={`${selectedHarness}/${selectedHarness === harness && model ? model : "default"}`}
        >
          <CommandInput
            placeholder={`Search ${available ? "all models" : "models"}…`}
            maxLength={500}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="min-h-0 flex-1">
            <CommandEmpty>No models match “{query}”.</CommandEmpty>
            {groups.map((option) => {
              const nativeDefault = choices.find(
                (choice) => choice.harness === option.value && choice.isDefault,
              );
              const models = choices.filter((choice) => choice.harness === option.value);
              return (
                <CommandGroup key={option.value} heading={query ? option.label : undefined}>
                  {!query && (
                    <CommandItem
                      aria-label={defaultModelLabel}
                      value={`${option.value}/default`}
                      onSelect={() => select(option.value, "")}
                    >
                      <Check
                        aria-hidden="true"
                        className={`size-3.5 ${harness === option.value && !model ? "text-primary" : "invisible"}`}
                      />
                      <span className="grid min-w-0 gap-0.5">
                        <span>{defaultModelLabel}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {nativeDefault
                            ? `Currently ${nativeDefault.name}`
                            : `${option.label} picks its own default`}
                        </span>
                      </span>
                    </CommandItem>
                  )}
                  {models.map((choice) => (
                    <CommandItem
                      key={key(choice)}
                      aria-label={choice.name}
                      value={key(choice)}
                      keywords={[choice.name, choice.provider ?? "", option.label]}
                      title={choice.description}
                      onSelect={() => select(choice.harness, choice.id)}
                    >
                      <Check
                        aria-hidden="true"
                        className={`size-3.5 ${harness === choice.harness && model === choice.id ? "text-primary" : "invisible"}`}
                      />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate">{choice.name}</span>
                        {(query || choice.provider) && (
                          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            {query && <HarnessIcon harness={choice.harness} compact />}
                            <span className="truncate">
                              {[
                                query && option.label,
                                choice.provider !== option.label && choice.provider,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        )}
                      </span>
                      {choice.saved && (
                        <span className="text-xs text-muted-foreground">Current</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {customAllowed &&
              !choices.some(
                (choice) => choice.harness === selectedHarness && choice.id === query,
              ) && (
                <CommandGroup heading="Custom model">
                  <CommandItem
                    value={`Use ${query}`}
                    onSelect={() => select(selectedHarness, query)}
                  >
                    <span className="truncate">Use “{query}”</span>
                  </CommandItem>
                </CommandGroup>
              )}
          </CommandList>
        </Command>
        {note}
        <div className="flex shrink-0 items-center justify-end border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!available || refreshing}
            onClick={refresh}
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "motion-safe:animate-spin" : ""}
            />
            Refresh models
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
