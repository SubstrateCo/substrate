import { account } from "./provision/accounts";
import { config, parallel, type Account } from "./provision/client";
import { context } from "./provision/context";
import { crm } from "./provision/crm";
import {
  fixtureCounts,
  provisioningTarget,
  requireNotificationMembers,
  SEED_PROFILE,
  SEED_VERSION,
} from "./provision/fixture";
import { notifications } from "./provision/notifications";
import { organization, sizes } from "./provision/organizations";
import { pictures } from "./provision/pictures";
import { workspace } from "./provision/workspaces";
import type { LoadOrganization } from "./types";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (!Number.isSafeInteger(config.users) || config.users < 8 || config.users > 200)
  throw new Error("LOAD_USERS must be an integer from 8 to 200 (one owner per organization).");
provisioningTarget(config);
requireNotificationMembers(sizes(config.users));
if (process.env.LOAD_SEED_PROFILE && process.env.LOAD_SEED_PROFILE !== SEED_PROFILE)
  throw new Error(`LOAD_SEED_PROFILE must be ${SEED_PROFILE}`);
if (process.env.LOAD_SEED_VERSION && process.env.LOAD_SEED_VERSION !== String(SEED_VERSION))
  throw new Error(`LOAD_SEED_VERSION must be ${SEED_VERSION}`);

const started = Date.now();
const accounts: Account[] = [];
const organizations: LoadOrganization[] = [];
const output = fileURLToPath(new URL("./.data/users.json", import.meta.url));
await mkdir(fileURLToPath(new URL("./.data", import.meta.url)), { recursive: true });

async function save(complete = false) {
  await Bun.write(
    `${output}.tmp`,
    JSON.stringify(
      {
        apiUrl: config.apiUrl,
        origin: config.origin,
        password: config.password,
        seed: {
          version: SEED_VERSION,
          profile: SEED_PROFILE,
          complete,
          countBasis: "planned-minimum",
          counts: fixtureCounts(sizes(config.users)),
        },
        organizations,
        users: accounts.flatMap((item) => {
          if (!item.organizationId) return [];
          const { client: _client, ...user } = item;
          return [user];
        }),
      },
      null,
      2,
    ),
  );
  await rename(`${output}.tmp`, output);
}

try {
  await parallel(
    Array.from({ length: config.users }, (_, index) => index),
    async (index) => {
      accounts[index] = await account(index);
      if ((index + 1) % 25 === 0) console.log(`Verified ${index + 1}/${config.users} accounts`);
    },
  );
  let offset = 0;
  for (const [index, size] of sizes(config.users).entries()) {
    const members = accounts.slice(offset, offset + size);
    organizations.push(await organization(members, index));
    await save();
    const conversationId = await workspace(members, index);
    await crm(members);
    await context(members, conversationId);
    await pictures(members, index);
    await notifications(members, conversationId);
    console.log(`Provisioned ${organizations[index]!.name}: ${size} members`);
    offset += size;
  }
  await save(true);
  console.log(
    `Saved ${accounts.length} users in ${organizations.length} organizations to ${output} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
} finally {
  await Promise.all(accounts.map((item) => item.client.dispose()));
}
