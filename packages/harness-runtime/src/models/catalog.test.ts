import { codexModels, openCodeModels, acpModels } from "./catalog";
import { expect, test } from "bun:test";

test("OpenCode catalog keeps enabled chat models and provider-qualified IDs", () => {
  const models = openCodeModels(
    [
      { id: "sonnet", providerID: "anthropic", name: "Claude Sonnet", enabled: true, type: "chat" },
      { id: "off", providerID: "anthropic", name: "Disabled", enabled: false, type: "chat" },
      { id: "image", providerID: "openai", name: "Image", enabled: true, type: "image" },
    ],
    [{ id: "anthropic", name: "Anthropic" }],
    { id: "sonnet", providerID: "anthropic" },
  );
  expect(models).toEqual([
    { id: "anthropic/sonnet", name: "Claude Sonnet", provider: "Anthropic", isDefault: true },
  ]);
});

test("Codex discovery follows every page and keeps the native model identifier", async () => {
  const models = await codexModels(async (cursor) =>
    cursor === "page-2"
      ? {
          data: [{ model: "next-model", displayName: "Next model", isDefault: false }],
          nextCursor: null,
        }
      : {
          data: [{ model: "first-model", displayName: "First model", isDefault: true }],
          nextCursor: "page-2",
        },
  );
  expect(models).toEqual([
    { id: "first-model", name: "First model", isDefault: true },
    { id: "next-model", name: "Next model", isDefault: false },
  ]);
});

test("ACP discovery flattens grouped model options, without confusing effort choices for models", () => {
  expect(
    acpModels({
      configOptions: [
        {
          id: "effort",
          category: "thought_level",
          type: "select",
          currentValue: "high",
          options: [{ value: "high", name: "High" }],
        },
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: "gemini-pro",
          options: [
            {
              group: "Google",
              options: [
                { value: "gemini-pro", name: "Gemini Pro" },
                { value: "gemini-flash", name: "Gemini Flash" },
              ],
            },
          ],
        },
      ],
    }),
  ).toEqual([
    { id: "gemini-pro", name: "Gemini Pro", isDefault: true },
    { id: "gemini-flash", name: "Gemini Flash", isDefault: false },
  ]);
});
