import { baselineEnvironment } from "./run-environment";
import { expect, test } from "bun:test";

test("baseline rejects inherited remote routing and acceptance overrides", () => {
  const env = baselineEnvironment({
    PATH: "executables",
    DATABASE_URL: "postgres://remote/production",
    LOAD_API_URL: "https://production.example",
    LOAD_DATABASE_URL: "postgres://remote/production",
    LOAD_USERS: "2000",
    DOCKER_HOST: "ssh://production",
    COMPOSE_FILE: "production.yaml",
    K6_NO_THRESHOLDS: "true",
    VUS: "2000",
    API_P95_MS: "999999",
  });
  expect(env).toMatchObject({
    PATH: "executables",
    DATABASE_URL: "postgres://substrate_load:substrate_load@localhost:5435/substrate_load",
    LOAD_DATABASE_URL: "postgres://substrate_load:substrate_load@localhost:5435/substrate_load",
    LOAD_API_URL: "http://localhost:3201",
    LOAD_USERS: "200",
    API_P95_MS: "1000",
  });
  for (const key of ["DOCKER_HOST", "COMPOSE_FILE", "K6_NO_THRESHOLDS", "VUS"])
    expect(env).not.toHaveProperty(key);
});
