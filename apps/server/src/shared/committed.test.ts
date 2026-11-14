import type { RealtimeHint } from "@substrate/contracts/realtime";

import { createCommittedPublisher } from "./committed";
import { expect, test } from "bun:test";

test("committed publishing preserves the result and only triggers requested mail", async () => {
  const published: RealtimeHint[][] = [];
  let triggers = 0;
  const publish = createCommittedPublisher({
    publish: async (hints) => {
      published.push(hints);
    },
    sharingMail: {
      trigger: () => {
        triggers++;
      },
    },
  });
  const hints: RealtimeHint[] = [{ audience: ["user", "owner"], domain: "access" }];
  expect(await publish({ result: "saved", hints })).toBe("saved");
  expect(published).toEqual([hints]);
  expect(triggers).toBe(0);
  expect(await publish({ result: null, hints: [], mail: ["sharing"] })).toBeNull();
  expect(published).toEqual([hints, []]);
  expect(triggers).toBe(1);
});
