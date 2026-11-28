import type { HarnessKind, SkillUpdateFrequency } from "@substrate/contracts/harness-runtime";

import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { queryKeys } from "../keys";
import { searchSkills } from "@/api/agents/skill-catalog";
import { harnessBridge } from "@/lib/desktop/bridges";

export const skillSearchOptions = (userId: string, query: string) =>
  queryOptions({
    queryKey: queryKeys.skillCatalog(userId, query),
    queryFn: query.length >= 2 ? ({ signal }) => searchSkills(query, signal) : skipToken,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export function skillPackageController(
  agentId: string | undefined,
  harness: HarnessKind,
  available: boolean,
) {
  const bridge = harnessBridge();
  if (!bridge || !agentId || !available) return undefined;
  const scope = { agentId, harness };
  return {
    scan: () => bridge.scanSkillPackages(scope),
    preview: (source: string) => bridge.previewSkillSource({ ...scope, source }),
    install: (input: { source: string; name: string }) =>
      bridge.installSkillPackage({ ...scope, ...input }),
    remove: (name: string) => bridge.removeSkillPackage({ ...scope, name }),
    update: () => bridge.updateSkillPackages({ ...scope, scheduled: false }),
    frequency: (frequency: SkillUpdateFrequency) =>
      bridge.setSkillUpdateFrequency({ ...scope, frequency }),
  };
}
type Controller = ReturnType<typeof skillPackageController>;

/** Debounce only query input; TanStack Query owns all fetched state. */
export function useSkillSearchInput(value: string) {
  const [query, setQuery] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), 400);
    return () => clearTimeout(timer);
  }, [value]);
  return query;
}

export const skillPackagesOptions = (
  userId: string,
  organizationId: string,
  agentId: string,
  harness: HarnessKind,
  controller: Controller,
) =>
  queryOptions({
    queryKey: queryKeys.skillPackages(userId, organizationId, agentId, harness),
    queryFn: controller ? controller.scan : skipToken,
    retry: false,
    refetchInterval: controller ? 60_000 : false,
  });

export const skillSourceOptions = (
  userId: string,
  organizationId: string,
  agentId: string,
  source: string,
  controller: Controller,
) =>
  queryOptions({
    queryKey: queryKeys.skillSource(userId, organizationId, agentId, source),
    queryFn: controller && source ? () => controller.preview(source) : skipToken,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

export function useSkillPackageMutations(
  userId: string,
  organizationId: string,
  agentId: string,
  harness: HarnessKind,
  controller: Controller,
) {
  const client = useQueryClient();
  function requireController() {
    if (!controller) throw new Error("Open this agent on its home desktop to manage skills.");
    return controller;
  }
  const onSuccess = () =>
    client.invalidateQueries({
      queryKey: queryKeys.localAgentConfiguration(userId, organizationId, agentId, harness),
    });
  const install = useMutation({
    mutationFn: (input: { source: string; name: string }) => requireController().install(input),
    onSettled: onSuccess,
  });
  const remove = useMutation({
    mutationFn: (name: string) => requireController().remove(name),
    onSettled: onSuccess,
  });
  const update = useMutation({
    mutationFn: () => requireController().update(),
    onSettled: onSuccess,
  });
  const frequency = useMutation({
    mutationFn: (value: SkillUpdateFrequency) => requireController().frequency(value),
    onSuccess,
  });
  return { install, remove, update, frequency };
}
