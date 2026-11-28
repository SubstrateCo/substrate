import { harnessKinds } from "@substrate/contracts/harness-runtime";
import { createHarnessHost } from "@substrate/harness-runtime";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "substrate-evals-models-"));
const host = await createHarnessHost({ accountDirectory: directory });
try {
  for (const harness of harnessKinds) {
    const catalog = await host.listModels({ organizationId: "models", harness });
    console.log(`\n${harness}: ${catalog.status}`);
    for (const model of catalog.models)
      console.log(`  ${model.id}${model.isDefault ? " (default)" : ""}  ${model.name}`);
  }
} finally {
  await host.dispose();
  await rm(directory, { recursive: true, force: true });
}
