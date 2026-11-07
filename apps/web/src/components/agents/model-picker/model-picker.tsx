import type { HarnessKind, HarnessModel } from "@startup-os/contracts/harness";

import { useQueries } from "@tanstack/react-query";

import { useState } from "react";

import { harnessOptions } from "../harness-meta";
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
import { harnessModelsQueryOptions } from "@/queries/agents/models";
import { Check, ChevronsUpDown, RefreshCw, Star } from "lucide-react";
import { z } from "zod";

type Choice = HarnessModel & { harness: HarnessKind; saved?: boolean };
const favoriteKeys = z.array(z.string().max(600)).max(1000);

// T3 Code's provider rail and grouped model rows, adapted to our native bridge and UI primitives.
// Source: pingdotgg/t3code/apps/web/src/components/chat (MIT, icons/LICENSE).
export function ModelPicker({
  userId,
  organizationId,
  harness,
  model,
  disabled,
  onChange,
}: {
  userId: string;
  organizationId?: string | null;
  harness: HarnessKind;
  model?: string;
  disabled: boolean;
  onChange: (harness: HarnessKind, model: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedHarness, setSelectedHarness] = useState<HarnessKind | "favorites">(harness);
  const [search, setSearch] = useState("");
  const favoriteStorageKey = `startup-os:model-favorites:${userId}:${organizationId ?? ""}`;
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return favoriteKeys.parse(JSON.parse(localStorage.getItem(favoriteStorageKey) ?? "[]"));
    } catch {
      return [];
    }
  });
  const available = !!window.startupOSHarness && !!organizationId;
  const catalogs = useQueries({
    queries: harnessOptions.map((option) => ({
      ...harnessModelsQueryOptions(userId, organizationId ?? "", option.value),
      enabled: open && available,
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
  const query = search.trim();
  const selectedIndex = harnessOptions.findIndex((option) => option.value === selectedHarness);
  const selectedCatalog = selectedHarness === "favorites" ? undefined : catalogs[selectedIndex];
  const groups = harnessOptions.filter(
    (option) => query || selectedHarness === "favorites" || selectedHarness === option.value,
  );
  const customHarness = selectedHarness === "favorites" ? harness : selectedHarness;
  const customAllowed =
    query.length > 0 && (customHarness !== "opencode" || /^[^/\s]+\/\S+$/.test(query));
  function key(choice: Choice) {
    return `${choice.harness}/${choice.id}`;
  }
  function select(nextHarness: HarnessKind, id: string) {
    onChange(nextHarness, id || undefined);
    setOpen(false);
  }
  function chooseHarness(value: HarnessKind | "favorites") {
    setSelectedHarness(value);
    setSearch("");
  }
  function toggleFavorite(choice: Choice) {
    const next = favorites.includes(key(choice))
      ? favorites.filter((item) => item !== key(choice))
      : [...favorites, key(choice)];
    setFavorites(next);
    try {
      localStorage.setItem(favoriteStorageKey, JSON.stringify(next));
    } catch {
      /* Favorites remain available for this editor when storage is unavailable. */
    }
  }
  const isLoading =
    selectedHarness === "favorites"
      ? catalogs.some((catalog) => catalog.isFetching)
      : selectedCatalog?.isFetching;
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
          type="button"
          variant="outline"
          size="selection"
          disabled={disabled}
          aria-label={`Harness & model: ${label} · ${modelName}`}
          title={`${label} · ${modelName}`}
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
      <PopoverContent
        variant="reference"
        align="end"
        collisionPadding={8}
        className="h-80 max-h-(--radix-popover-content-available-height) w-96 flex-row"
        aria-label="Harness and model picker"
      >
        <div
          className="flex w-11 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-muted/30 p-1"
          role="group"
          aria-label="Harnesses"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Favorites"
            aria-pressed={selectedHarness === "favorites"}
            onClick={() => chooseHarness("favorites")}
          >
            <Star />
          </Button>
          <div className="my-1 border-t" />
          {harnessOptions.map((option) => (
            <div key={option.value} className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
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
              {selectedHarness === option.value && (
                <span className="pointer-events-none absolute top-2 right-0 h-4 w-0.5 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Command className="min-h-0 flex-1">
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
                const models = choices.filter(
                  (choice) =>
                    choice.harness === option.value &&
                    (selectedHarness !== "favorites" || favorites.includes(key(choice))),
                );
                return (
                  <CommandGroup key={option.value} heading={option.label}>
                    {selectedHarness !== "favorites" && !query && (
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
                      <CommandItem
                        key={key(choice)}
                        aria-label={choice.name}
                        value={key(choice)}
                        keywords={[choice.name, choice.provider ?? "", option.label]}
                        onSelect={() => select(choice.harness, choice.id)}
                        title={choice.description}
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Favorite ${choice.name} via ${option.label}`}
                          aria-pressed={favorites.includes(key(choice))}
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(choice);
                          }}
                        >
                          <Star
                            className={
                              favorites.includes(key(choice))
                                ? "fill-current text-primary"
                                : "text-muted-foreground"
                            }
                          />
                        </Button>
                      </CommandItem>
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
            {selectedCatalog?.data?.status === "unavailable" && <span>Unavailable</span>}
            {selectedCatalog?.error && <span role="alert">Couldn’t load models</span>}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh models"
              disabled={!available || catalogs.some((catalog) => catalog.isFetching)}
              onClick={() =>
                catalogs.forEach((catalog) => {
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
