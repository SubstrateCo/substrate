import { Rate, Trend } from "k6/metrics";

// HTTP/1.1 browsers keep at most six connections to one origin. asyncRequest has no such limit.
const limit = Number(__ENV.HTTP_CONNECTIONS ?? 6);
const queueDuration = new Trend("client_connection_queue", true);
const requestDuration = new Trend("client_request_wall", true);
const newConnection = new Rate("client_connection_new");
let active = 0;
const waiting: (() => void)[] = [];

export async function withConnection<T extends { timings: { connecting: number } }>(
  request: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  if (limit > 0 && active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  queueDuration.add(Date.now() - started);
  try {
    const response = await request();
    newConnection.add(response.timings.connecting > 0);
    return response;
  } finally {
    requestDuration.add(Date.now() - started);
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
