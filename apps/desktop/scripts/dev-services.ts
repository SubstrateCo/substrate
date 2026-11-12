import { isDeepStrictEqual } from "node:util";

interface DevelopmentService {
  name: string;
  script: "dev:server" | "dev:web";
  url: string;
  ready: () => Promise<boolean>;
}

type FetchService = (url: string, init: RequestInit) => Promise<Response>;

export function developmentServices(
  webURL: string,
  apiURL: string,
  fetchService: FetchService = fetch,
): DevelopmentService[] {
  const services: Omit<DevelopmentService, "ready">[] = [
    { name: "API", script: "dev:server", url: new URL("/api/auth/get-session", apiURL).href },
    { name: "web", script: "dev:web", url: new URL("/login", webURL).href },
  ];
  return services.map((service) => ({
    ...service,
    async ready() {
      try {
        const response = await fetchService(service.url, {
          signal: AbortSignal.timeout(2_000),
          redirect: "manual",
          credentials: "omit",
        });
        if (service.script === "dev:web") {
          await response.text();
          return response.ok || response.status === 302 || response.status === 307;
        }
        if (!response.ok) {
          await response.body?.cancel();
          return false;
        }
        const body: unknown = await response.json();
        return isDeepStrictEqual(body, { success: true, data: null });
      } catch {
        return false;
      }
    },
  }));
}

export async function ensureDevelopmentServices(
  services: DevelopmentService[],
  start: (service: DevelopmentService) => { readonly exitCode: number | null },
  stopping: () => boolean,
) {
  await Promise.all(
    services.map(async (service) => {
      if (await service.ready()) return;
      if (stopping()) return;
      const child = start(service);
      const deadline = Date.now() + 60_000;
      while (!(await service.ready())) {
        if (stopping()) return;
        if (child.exitCode !== null)
          throw new Error(`The ${service.name} server exited before it was ready.`);
        if (Date.now() > deadline)
          throw new Error(`The ${service.name} server did not become ready within 60 seconds.`);
        await Bun.sleep(500);
      }
    }),
  );
}
