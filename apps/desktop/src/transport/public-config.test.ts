import { resolvePublicConfig } from "./public-config.ts";
import { expect, test } from "bun:test";

const built = {
  apiURL: "https://api.example.com",
  webURL: "https://app.example.com",
  storageOrigins: ["https://storage.example.com"],
};

test("a build reads every public origin from the environment", () => {
  expect(
    resolvePublicConfig(
      {
        SUBSTRATE_API_URL: "https://api.example.com",
        SUBSTRATE_WEB_URL: "https://app.example.com",
        S3_ENDPOINT: "https://storage.example.com/bucket",
      },
      { packaged: true },
    ),
  ).toEqual(built);
});

test("a packaged app ignores environment overrides of its build's origins", () => {
  const config = resolvePublicConfig(
    {
      SUBSTRATE_API_URL: "https://staging.example.com",
      SUBSTRATE_WEB_URL: "https://staging-app.example.com",
      S3_ENDPOINT: "https://other.example.com",
    },
    { packaged: true, built },
  );
  expect(config).toEqual(built);
});
