import { account } from "./provision/accounts";
import { config, parallel, type Account, type Organization } from "./provision/client";
import { organization, sizes } from "./provision/organizations";
import { pictures } from "./provision/pictures";
import { workspace } from "./provision/workspaces";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (!Number.isSafeInteger(config.users) || config.users < 8)
  throw new Error("LOAD_USERS must be an integer of at least 8 (one owner per organization).");

const started = Date.now();
const accounts: Account[] = new Array(config.users);
const organizations: Organization[] = [];
const output = fileURLToPath(new URL("./.data/users.json", import.meta.url));
await mkdir(fileURLToPath(new URL("./.data", import.meta.url)), { recursive: true });

async function save() {
  await Bun.write(
    `${output}.tmp`,
    JSON.stringify(
      {
        apiUrl: config.apiUrl,
        origin: config.origin,
        password: config.password,
        organizations,
        users: accounts
          .filter((item) => item?.organizationId)
          .map(({ client: _client, ...user }) => user),
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
    await workspace(members, index);
    await pictures(members, index);
    console.log(`Provisioned ${organizations[index]!.name}: ${size} members`);
    offset += size;
  }
  await save();
  console.log(
    `Saved ${accounts.length} users in ${organizations.length} organizations to ${output} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
} finally {
  await Promise.all(accounts.filter(Boolean).map((item) => item.client.dispose()));
}
