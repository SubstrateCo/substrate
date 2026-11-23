import type { HarnessKind, HarnessModel } from "@substrate/contracts/harness";

import { useQueries, useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import type { StartSignIn } from "../sign-in/harness-account";
import { PickerSignIn } from "../sign-in/harness-account-view";
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
import { harnessLabel, harnessOptions, visibleHarnessOptions } from "@/lib/agents/harness-meta";
import { harnessStatusQueryOptions } from "@/queries/agents/harness-status";
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

function useModelCatalogs({
  userId,
  organizationId,
  agentId,
  open,
  harness,
  browseHarness,
  searching,
}: {
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  open: boolean;
  harness: HarnessKind;
  browseHarness: HarnessKind;
  searching: boolean;
}) {
  const available = !!harnessBridge() && !!organizationId;
  const status = useQuery({
    ...harnessStatusQueryOptions(userId, organizationId ?? ""),
    enabled: available,
  });
  const options = visibleHarnessOptions(status.data, harness);
  const includesHarness = (value: HarnessKind) =>
    options.some((option) => option.value === value) && (searching || value === browseHarness);
  const catalogs = useQueries({
    queries: harnessOptions.map((option) => ({
      ...harnessModelsQueryOptions(userId, organizationId ?? "", option.value, agentId),
      enabled: open && available && includesHarness(option.value),
    })),
  });
  const choices: Choice[] = harnessOptions.flatMap((option, index) =>
    (catalogs[index]?.data?.models ?? []).map((item) => ({ ...item, harness: option.value })),
  );
  const selected = catalogs[harnessOptions.findIndex((option) => option.value === browseHarness)];
  const groups = harnessOptions.filter(
    (option, index) =>
      // Unavailable and signed-out harnesses have no models to list.
      (catalogs[index]?.data?.status ?? "ready") === "ready" && includesHarness(option.value),
  );
  return {
    available,
    options,
    choices,
    groups,
    selected: {
      unavailable: selected.data?.status === "unavailable",
      signIn: selected.data?.status === "sign-in",
      methods: selected.data?.auth?.methods ?? [],
      loading: selected.isPending && selected.fetchStatus === "fetching",
      error: selected.error,
    },
    refreshing: catalogs.some((catalog) => catalog.isFetching),
    refresh: () => {
      catalogs.forEach((catalog, index) => {
        if (includesHarness(harnessOptions[index]!.value)) void catalog.refetch();
      });
    },
  };
}

/** A search can name a model the catalog lacks. OpenCode models need a provider/model ID. */
function customModelAllowed(harness: HarnessKind, query: string) {
  return query.length > 0 && (harness !== "opencode" || /^[^/\s]+\/\S+$/.test(query));
}

function choiceKey(choice: Choice) {
  return `${choice.harness}/${choice.id}`;
}

/** One model row. A search names the runtime of each row. */
function ModelItem({
  choice,
  groupLabel,
  query,
  checked,
  onSelect,
}: {
  choice: Choice;
  groupLabel: string;
  query: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      aria-label={choice.name}
      value={choiceKey(choice)}
      keywords={[choice.name, choice.provider ?? "", groupLabel]}
      title={choice.description}
      onSelect={onSelect}
    >
      <Check aria-hidden="true" className={`size-3.5 ${checked ? "text-primary" : "invisible"}`} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate">{choice.name}</span>
        {(query || choice.provider) && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {query && <HarnessIcon harness={choice.harness} compact />}
            <span className="truncate">
              {[query && groupLabel, choice.provider !== groupLabel && choice.provider]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        )}
      </span>
      {choice.saved && <span className="text-xs text-muted-foreground">Current</span>}
    </CommandItem>
  );
}

/** The models of each listed runtime, then a custom model for the search text. */
function ModelList({
  groups,
  choices,
  query,
  harness,
  model,
  browseHarness,
  customAllowed,
  onSelect,
}: {
  groups: { value: HarnessKind; label: string }[];
  choices: Choice[];
  query: string;
  harness: HarnessKind;
  model?: string;
  browseHarness: HarnessKind;
  customAllowed: boolean;
  onSelect: (harness: HarnessKind, id: string) => void;
}) {
  return (
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
                onSelect={() => onSelect(option.value, "")}
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
              <ModelItem
                key={choiceKey(choice)}
                choice={choice}
                groupLabel={option.label}
                query={query}
                checked={
                  harness === choice.harness &&
                  (model === choice.id || (!model && choice.id === "default"))
                }
                onSelect={() => onSelect(choice.harness, choice.id)}
              />
            ))}
          </CommandGroup>
        );
      })}
      {customAllowed &&
        !choices.some((choice) => choice.harness === browseHarness && choice.id === query) && (
          <CommandGroup heading="Custom model">
            <CommandItem value={`Use ${query}`} onSelect={() => onSelect(browseHarness, query)}>
              <span className="truncate">Use “{query}”</span>
            </CommandItem>
          </CommandGroup>
        )}
    </CommandList>
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
  onSignIn,
}: {
  id?: string;
  userId: string;
  organizationId?: string | null;
  agentId?: string;
  harness: HarnessKind;
  model?: string;
  disabled: boolean;
  onChange: (harness: HarnessKind, model: string | undefined) => void;
  /** Starts a sign-in for a harness that needs one. Absent outside the desktop app. */
  onSignIn?: StartSignIn;
}) {
  const [open, setOpen] = useState(false);
  const [browseOverride, setBrowseOverride] = useState<HarnessKind>();
  const [search, setSearch] = useState("");
  const browseHarness = browseOverride ?? harness;
  const query = search.trim();
  const { available, options, choices, groups, selected, refreshing, refresh } = useModelCatalogs({
    userId,
    organizationId,
    agentId,
    open,
    harness,
    browseHarness,
    searching: !!query,
  });
  const modelName = includeSavedModel(choices, harness, model)?.name ?? defaultModelLabel;
  const label = harnessLabel(harness);
  const selectedLabel = harnessLabel(browseHarness);
  function select(nextHarness: HarnessKind, id: string) {
    onChange(nextHarness, id || undefined);
    setOpen(false);
  }
  function chooseHarness(value: HarnessKind) {
    setBrowseOverride(value);
    setSearch("");
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setBrowseOverride(undefined);
          setSearch("");
        }
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
            value={browseHarness}
            options={options}
            onValueChange={chooseHarness}
          />
        </div>
        {selected.signIn && (
          <PickerSignIn
            label={selectedLabel}
            methods={selected.methods}
            onSignIn={
              onSignIn &&
              ((method) => {
                setOpen(false);
                onSignIn(browseHarness, method);
              })
            }
          />
        )}
        {!selected.unavailable && !selected.signIn && (
          <Command
            key={`${open}/${browseHarness}`}
            className="min-h-0 flex-1"
            defaultValue={`${browseHarness}/${browseHarness === harness && model ? model : "default"}`}
          >
            <div className="p-2">
              <CommandInput
                placeholder={`Search ${available ? "all models" : "models"}…`}
                maxLength={500}
                value={search}
                onValueChange={setSearch}
              />
            </div>
            <ModelList
              groups={groups}
              choices={choices}
              query={query}
              harness={harness}
              model={model}
              browseHarness={browseHarness}
              customAllowed={customModelAllowed(browseHarness, query)}
              onSelect={select}
            />
          </Command>
        )}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t px-3 py-2">
          <ModelCatalogStatus
            available={available}
            label={selectedLabel}
            unavailable={selected.unavailable}
            loading={selected.loading}
            error={selected.error}
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
