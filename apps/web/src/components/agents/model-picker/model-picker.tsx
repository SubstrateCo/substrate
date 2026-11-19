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

function includeSavedModel(choices: Choice[], harness: HarnessKind, model: string | undefined) {
  const saved = choices.find((choice) => choice.harness === harness && choice.id === model);
  if (saved || !model) return saved;
  const fallback = { id: model, name: model, harness, saved: true };
  choices.push(fallback);
  return fallback;
}

/** A short state in the picker footer, such as "Open the desktop app". */
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
    <div className="flex min-w-0 flex-1 items-start gap-2 text-xs text-muted-foreground [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <div className="grid min-w-0 flex-1 gap-2">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

function ModelCatalogStatus({
  available,
  label,
  unavailable,
  loading,
  error,
  onRetry,
}: {
  available: boolean;
  label: string;
  unavailable: boolean;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (!available)
    return (
      <PickerNote icon={<Laptop aria-hidden="true" />}>
        Open Substrate on your desktop to see {label}’s models. Until then, the agent uses the
        default model.
      </PickerNote>
    );
  if (error)
    return (
      <PickerNote
        icon={<CircleAlert aria-hidden="true" className="text-destructive" />}
        action={
          <Button type="button" size="xs" variant="outline" className="w-fit" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        }
      >
        <span role="alert">We couldn’t load {label}’s models.</span>
      </PickerNote>
    );
  if (unavailable)
    return (
      <PickerNote icon={<Laptop aria-hidden="true" />}>
        {label} isn’t installed on this desktop. Install it, then refresh.
      </PickerNote>
    );
  if (loading)
    return <PickerNote icon={<Spinner aria-hidden="true" />}>Loading {label} models…</PickerNote>;
  return null;
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
  const available = !!harnessBridge() && !!organizationId;
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
  const modelName = includeSavedModel(choices, harness, model)?.name ?? defaultModelLabel;
  const label = harnessLabel(harness);
  const selectedLabel = harnessLabel(selectedHarness);
  const selectedIndex = harnessOptions.findIndex((option) => option.value === selectedHarness);
  const selectedCatalog = catalogs[selectedIndex];
  const selectedUnavailable = selectedCatalog.data?.status === "unavailable";
  const groups = harnessOptions.filter(
    (option, index) =>
      catalogs[index]?.data?.status !== "unavailable" &&
      (query || selectedHarness === option.value),
  );
  const customAllowed =
    !selectedUnavailable &&
    query.length > 0 &&
    (selectedHarness !== "opencode" || /^[^/\s]+\/\S+$/.test(query));
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
        {!selectedUnavailable && (
          <Command
            key={`${open}/${selectedHarness}`}
            className="min-h-0 flex-1"
            defaultValue={`${selectedHarness}/${selectedHarness === harness && model ? model : "default"}`}
          >
            <div className="p-2">
              <CommandInput
                placeholder={`Search ${available ? "all models" : "models"}…`}
                maxLength={500}
                value={search}
                onValueChange={setSearch}
              />
            </div>
            <CommandList className="min-h-0 flex-1">
              <CommandEmpty>No models match “{query}”.</CommandEmpty>
              {groups.map((option) => {
                const nativeDefault = choices.find(
                  (choice) => choice.harness === option.value && choice.isDefault,
                );
                const models = choices.filter((choice) => choice.harness === option.value);
                return (
                  <CommandGroup key={option.value} heading={query ? option.label : undefined}>
                    {!query && !models.some((choice) => choice.id === "default") && (
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
                          className={`size-3.5 ${harness === choice.harness && (model === choice.id || (!model && choice.id === "default")) ? "text-primary" : "invisible"}`}
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
        )}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t px-3 py-2">
          <ModelCatalogStatus
            available={available}
            label={selectedLabel}
            unavailable={selectedUnavailable}
            loading={selectedCatalog.isPending && selectedCatalog.fetchStatus === "fetching"}
            error={selectedCatalog.error}
            onRetry={refresh}
          />
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
import { harnessBridge } from "@/lib/desktop/bridges";
