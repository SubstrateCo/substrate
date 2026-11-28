import { appOrigin } from "./environment";
import { expect, type APIRequestContext } from "@playwright/test";

export type HostTurn = { turn: { id: string; attempt: number }; session: { key: string } };
type HostBody = { attempt?: number; status?: string; outcome?: string; messageIds?: string[] };

export function host(request: APIRequestContext, organizationId: string, installationId: string) {
  return (path: string, data: HostBody = {}, from = appOrigin) =>
    request.post(`/api/v1/agent-work/${path}`, {
      headers: { origin: from, "x-substrate-installation": installationId },
      data: { organizationId, installationId, ...data },
    });
}

export async function claimOne(call: ReturnType<typeof host>): Promise<HostTurn> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const claimed = await call("host/claim");
    expect(claimed.ok()).toBe(true);
    const turns: HostTurn[] = (await claimed.json()).data.turns;
    const turn = turns.at(0);
    if (turn) return turn;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No turn was claimed.");
}

export async function registerDevice(request: APIRequestContext, installationId: string) {
  const registered = await request.post("/api/v1/agent-work/device/register", {
    headers: { origin: appOrigin },
    data: { installationId, name: "Laptop", platform: "win32" },
  });
  expect(registered.ok()).toBe(true);
}
