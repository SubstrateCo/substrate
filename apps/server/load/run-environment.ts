export function baselineEnvironment(inherited: Record<string, string | undefined>) {
  const env = { ...inherited };
  const overrides = [
    "MODE",
    "VUS",
    "RAMP",
    "DURATION",
    "PACE",
    "FLOWS",
    "ITERATIONS",
    "DEBUG_VU",
    "API_P95_MS",
    "API_P99_MS",
  ];
  for (const key of Object.keys(env)) {
    const externalSetting = ["LOAD_", "DOCKER_", "COMPOSE_", "K6_"].some((prefix) =>
      key.startsWith(prefix),
    );
    if (externalSetting || overrides.includes(key)) delete env[key];
  }
  const database = "postgres://substrate_load:substrate_load@localhost:5435/substrate_load";
  return {
    ...env,
    DATABASE_URL: database,
    LOAD_DATABASE_URL: database,
    LOAD_API_URL: "http://localhost:3201",
    LOAD_ORIGIN: "http://localhost:3200",
    LOAD_MAILPIT_URL: "http://localhost:8026",
    LOAD_USERS: "200",
    DATABASE_POOL_SIZE: "10",
    SERVER_METRICS: "1",
    API_P95_MS: "1000",
    API_P99_MS: "3000",
  };
}
