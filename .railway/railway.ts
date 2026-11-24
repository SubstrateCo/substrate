import { bucket, defineRailway, github, postgres, project, redis, service } from "railway/iac";

const repository = "SubstrateCo/substrate";
const region = "us-east4-eqdc4a";
const port = "8080";
const apiURL = "https://api.substrateco.xyz";
const webURL = "https://app.substrateco.xyz";

export default defineRailway(() => {
  const db = postgres("postgres", { region });
  const cache = redis("valkey", { region });
  const storage = bucket("storage", { region: "iad" });

  const api = service("api", {
    source: github(repository, { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/api/Dockerfile",
      watchPatterns: ["apps/server/**", "packages/**", "bun.lock", "deploy/api/**"],
    },
    preDeploy: "bun packages/database/src/migrate.ts",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [region]: 1 },
    env: {
      NODE_ENV: "production",
      PORT: port,
      SERVER_PORT: port,
      SUBSTRATE_API_URL: apiURL,
      SUBSTRATE_WEB_URL: webURL,
      DATABASE_URL: db.env.DATABASE_URL,
      VALKEY_URL: cache.env.REDIS_URL,
      S3_ENDPOINT: "${{storage.ENDPOINT}}",
      S3_REGION: "${{storage.REGION}}",
      S3_BUCKET: "${{storage.BUCKET}}",
      S3_ACCESS_KEY_ID: "${{storage.ACCESS_KEY_ID}}",
      S3_SECRET_ACCESS_KEY: "${{storage.SECRET_ACCESS_KEY}}",
      EMAIL_FROM: "Substrate <noreply@substrateco.xyz>",
      SUBSTRATE_WINDOWS_DOWNLOAD_URL:
        "https://github.com/SubstrateCo/substrate/releases/latest/download/Substrate-Setup.exe",
    },
  });

  const web = service("web", {
    source: github(repository, { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/web/Dockerfile",
      watchPatterns: ["apps/web/**", "packages/contracts/**", "bun.lock", "deploy/web/**"],
    },
    healthcheck: "/",
    replicas: { [region]: 1 },
    env: {
      PORT: port,
      API_UPSTREAM: `http://\${{api.RAILWAY_PRIVATE_DOMAIN}}:${port}`,
    },
  });

  const redirect = service("redirect", {
    source: github(repository, { branch: "main" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/redirect/Dockerfile",
      watchPatterns: ["deploy/redirect/**"],
    },
    replicas: { [region]: 1 },
    env: {
      PORT: port,
      REDIRECT_TARGET: webURL,
    },
  });

  return project("substrate", {
    resources: [db, cache, storage, api, web, redirect],
  });
});
