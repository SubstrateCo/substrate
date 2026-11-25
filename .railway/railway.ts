import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

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
    source: github(repository),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/api/Dockerfile",
      watchPatterns: ["apps/server/**", "packages/**", "bun.lock", "deploy/api/**"],
    },
    preDeploy: "bun packages/database/src/migrate.ts",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { [region]: 1 },
    domains: [{ domain: "api.substrateco.xyz", port: Number(port) }],
    env: {
      NODE_ENV: "production",
      // Secrets are set with `railway variables --set` and never written here.
      BETTER_AUTH_SECRET: preserve(),
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
      // Resend SMTP. Outbound SMTP needs the Railway Pro plan.
      SMTP_HOST: "smtp.resend.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "resend",
      SMTP_PASSWORD: preserve(),
      EMAIL_FROM: "Substrate <noreply@substrateco.xyz>",
      // "Substrate Web Production" OAuth client in GCP project substrate-515521.
      GOOGLE_CLIENT_ID: "101818974635-3dgl6172j9499tn9v967m5sq78pimtem.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: preserve(),
      SUBSTRATE_WINDOWS_DOWNLOAD_URL:
        "https://github.com/SubstrateCo/substrate/releases/latest/download/Substrate-Setup.exe",
      SUBSTRATE_MAC_DOWNLOAD_URL:
        "https://github.com/SubstrateCo/substrate/releases/latest/download/Substrate-mac-arm64.dmg",
    },
  });

  const web = service("web", {
    source: github(repository),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/web/Dockerfile",
      watchPatterns: ["apps/web/**", "packages/contracts/**", "bun.lock", "deploy/web/**"],
    },
    healthcheck: "/",
    replicas: { [region]: 1 },
    domains: [{ domain: "app.substrateco.xyz", port: Number(port) }],
    env: {
      PORT: port,
      API_UPSTREAM: `http://\${{api.RAILWAY_PRIVATE_DOMAIN}}:${port}`,
    },
  });

  const redirect = service("redirect", {
    source: github(repository),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "deploy/redirect/Dockerfile",
      watchPatterns: ["deploy/redirect/**"],
    },
    replicas: { [region]: 1 },
    domains: [
      { domain: "substrateco.xyz", port: Number(port) },
      { domain: "www.substrateco.xyz", port: Number(port) },
    ],
    env: {
      PORT: port,
      REDIRECT_TARGET: webURL,
    },
  });

  return project("substrate", {
    resources: [db, cache, storage, api, web, redirect],
  });
});
