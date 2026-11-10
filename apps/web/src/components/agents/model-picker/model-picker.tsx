import type { HarnessKind, HarnessModel } from "@startup-os/contracts/harness";

import { useQueries } from "@tanstack/react-query";

import { useState } from "react";

import { HarnessIcon } from "./harness-icon";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { harnessOptions } from "@/lib/agents/harness-meta";
import { harnessModelsQueryOptions } from "@/queries/agents/models";
import { Check, ChevronsUpDown, RefreshCw } from "lucide-react";

type Choice = HarnessModel & { harness: HarnessKind; saved?: boolean };

// T3 Code's provider rail and grouped model rows, adapted to our native bridge and UI primitives.
// Source: pingdotgg/t3code/apps/web/src/components/chat (MIT, icons/LICENSE).
export function ModelPicker({
  userId,
  organizationId,
  agentId,
  harness,
  model,
  disabled,
  onChange,
}: {
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
  const available = !!window.startupOSHarness && !!organizationId;
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
  const modelName = activeModel?.name ?? "Harness default";
  const label = harnessOptions.find((option) => option.value === harness)!.label;
  const selectedIndex = harnessOptions.findIndex((option) => option.value === selectedHarness);
  const selectedCatalog = catalogs[selectedIndex];
  const groups = harnessOptions.filter((option) => query || selectedHarness === option.value);
  const customHarness = selectedHarness;
  const customAllowed =
    query.length > 0 && (customHarness !== "opencode" || /^[^/\s]+\/\S+$/.test(query));
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
  const isLoading = selectedCatalog.isFetching;
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) chooseHarness(harness);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="selection"
              disabled={disabled}
              aria-label={`Harness & model: ${label} · ${modelName}`}
              className="min-h-16 w-full justify-start text-left"
            >
              <span className="mr-1 flex size-6 shrink-0 items-center justify-center">
                <HarnessIcon harness={harness} />
              </span>
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate">{modelName}</span>
                <span className="text-xs font-normal text-muted-foreground">{label}</span>
              </span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {label} · {modelName}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        variant="reference"
        align="end"
        collisionPadding={8}
        className="h-80 max-h-(--radix-popover-content-available-height) w-96 flex-row"
        aria-label="Harness and model picker"
      >
        <div
          className="flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r bg-muted/30 py-3"
          role="group"
          aria-label="Harnesses"
        >
          {harnessOptions.map((option) => (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={selectedHarness === option.value ? "secondary" : "ghost"}
                  size="icon"
                  aria-label={option.label}
                  aria-pressed={selectedHarness === option.value}
                  onClick={() => chooseHarness(option.value)}
                >
                  <HarnessIcon harness={option.value} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{option.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Command
            key={`${open}/${selectedHarness}`}
            className="min-h-0 flex-1"
            defaultValue={`${selectedHarness}/${selectedHarness === harness && model ? model : "default"}`}
          >
            <CommandInput
              placeholder="Search models…"
              maxLength={500}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="min-h-0 flex-1">
              <CommandEmpty>No models found.</CommandEmpty>
              {groups.map((option) => {
                const nativeDefault = choices.find(
                  (choice) => choice.harness === option.value && choice.isDefault,
                );
                const models = choices.filter((choice) => choice.harness === option.value);
                return (
                  <CommandGroup key={option.value} heading={option.label}>
                    {!query && (
                      <CommandItem
                        aria-label="Harness default"
                        value={`${option.value}/default`}
                        onSelect={() => select(option.value, "")}
                      >
                        <Check
                          className={`size-3.5 ${harness === option.value && !model ? "text-primary" : "invisible"}`}
                        />
                        <span className="grid min-w-0 gap-0.5">
                          <span>Harness default</span>
                          {nativeDefault && (
                            <span className="truncate text-xs text-muted-foreground">
                              {nativeDefault.name}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    )}
                    {models.map((choice) => (
                      <Tooltip key={key(choice)}>
                        <TooltipTrigger asChild>
                          <CommandItem
                            aria-label={choice.name}
                            value={key(choice)}
                            keywords={[choice.name, choice.provider ?? "", option.label]}
                            onSelect={() => select(choice.harness, choice.id)}
                          >
                            <Check
                              className={`size-3.5 ${harness === choice.harness && model === choice.id ? "text-primary" : "invisible"}`}
                            />
                            <span className="grid min-w-0 flex-1 gap-0.5">
                              <span className="truncate">{choice.name}</span>
                              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                <HarnessIcon harness={choice.harness} compact />
                                <span className="truncate">
                                  {option.label}
                                  {choice.provider && choice.provider !== option.label
                                    ? ` · ${choice.provider}`
                                    : ""}
                                </span>
                              </span>
                            </span>
                            {choice.saved && (
                              <span className="text-xs text-muted-foreground">Saved</span>
                            )}
                          </CommandItem>
                        </TooltipTrigger>
                        {choice.description && (
                          <TooltipContent side="right">{choice.description}</TooltipContent>
                        )}
                      </Tooltip>
                    ))}
                  </CommandGroup>
                );
              })}
              {customAllowed &&
                !choices.some(
                  (choice) => choice.harness === customHarness && choice.id === query,
                ) && (
                  <CommandGroup heading="Custom model">
                    <CommandItem
                      value={`Use ${query}`}
                      onSelect={() => select(customHarness, query)}
                    >
                      <span className="truncate">Use “{query}”</span>
                    </CommandItem>
                  </CommandGroup>
                )}
            </CommandList>
          </Command>
          <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
            {isLoading ? (
              <Spinner aria-label="Loading models" />
            ) : (
              <span>{available ? "Native models" : "Desktop required"}</span>
            )}
            {selectedCatalog.data?.status === "unavailable" && <span>Unavailable</span>}
            {selectedCatalog.error && <span role="alert">Couldn't load models</span>}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh models"
              disabled={!available || catalogs.some((catalog) => catalog.isFetching)}
              onClick={() =>
                catalogs.forEach((catalog, index) => {
                  if (query || harnessOptions[index]!.value === selectedHarness)
                    void catalog.refetch();
                })
              }
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
