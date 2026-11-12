import { connectedWork } from "./connected-work.ts";
import type { Flow } from "./flow.ts";
import { notifications } from "./notifications.ts";
import { rare } from "./rare.ts";
import { readMessages } from "./read-messages.ts";
import { search } from "./search.ts";
import { tasks } from "./tasks.ts";
import { writeMessages } from "./write-messages.ts";

export type { Flow, FlowContext } from "./flow.ts";

export const flows: Flow[] = [
  { name: "readMessages", weight: 35, backfillWeight: 0, run: readMessages },
  { name: "writeMessages", weight: 20, backfillWeight: 60, run: writeMessages },
  { name: "tasks", weight: 20, backfillWeight: 30, run: tasks },
  { name: "search", weight: 10, backfillWeight: 0, run: search },
  { name: "notifications", weight: 10, backfillWeight: 0, run: notifications },
  { name: "connectedWork", weight: 3, backfillWeight: 6, run: connectedWork },
  { name: "rare", weight: 2, backfillWeight: 4, run: rare },
];
