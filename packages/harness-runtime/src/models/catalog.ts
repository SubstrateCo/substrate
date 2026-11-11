import type { HarnessModel } from "@substrate/contracts/harness";

import { HarnessError } from "../errors.ts";
import { z } from "zod";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- This module parses native protocol catalog payloads before returning domain models. */

export function openCodeModels(
  models: { id: string; providerID: string; name: string; enabled: boolean; type?: string }[],
  providers: { id: string; name: string }[],
  defaultModel: { id: string; providerID: string } | null,
): HarnessModel[] {
  return models.flatMap((model) => {
    if (!model.enabled || (model.type && model.type !== "chat")) return [];
    return [
      {
        id: `${model.providerID}/${model.id}`,
        name: model.name,
        provider:
          providers.find((provider) => provider.id === model.providerID)?.name ?? model.providerID,
        isDefault: model.id === defaultModel?.id && model.providerID === defaultModel.providerID,
      },
    ];
  });
}

const codexPage = z.object({
  data: z.array(
    z.object({
      model: z.string().min(1),
      displayName: z.string().min(1),
      isDefault: z.boolean().optional(),
      hidden: z.boolean().optional(),
      description: z.string().optional(),
    }),
  ),
  nextCursor: z.string().nullish(),
});

export async function codexModels(
  requestPage: (cursor: string | undefined) => Promise<unknown>,
): Promise<HarnessModel[]> {
  const models: HarnessModel[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = codexPage.parse(await requestPage(cursor));
    for (const model of page.data) {
      if (model.hidden) continue;
      const choice: HarnessModel = {
        id: model.model,
        name: model.displayName,
        isDefault: model.isDefault ?? false,
      };
      if (model.description) choice.description = model.description;
      models.push(choice);
    }
    cursor = page.nextCursor || undefined;
    if (cursor && seen.has(cursor))
      throw new HarnessError("invalid-protocol", "Model pagination repeated a cursor.");
    if (models.length > 10000)
      throw new HarnessError("protocol-limit", "Model catalog is too large.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return models;
}

const acpOption = z.object({
  value: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
});
const acpSession = z.object({
  configOptions: z
    .array(
      z.object({
        id: z.string(),
        category: z.string().nullish(),
        type: z.string(),
        currentValue: z.unknown(),
        options: z
          .array(z.union([acpOption, z.object({ group: z.string(), options: z.array(acpOption) })]))
          .optional(),
      }),
    )
    .nullish(),
});

export function acpModels(response: unknown): HarnessModel[] {
  const model = acpSession
    .parse(response)
    .configOptions?.find((option) => option.category === "model" && option.type === "select");
  return (model?.options ?? [])
    .flatMap((entry) => ("value" in entry ? [entry] : entry.options))
    .map((option) => {
      const choice: HarnessModel = {
        id: option.value,
        name: option.name,
        isDefault: option.value === model?.currentValue,
      };
      if (option.description) choice.description = option.description;
      return choice;
    });
}
