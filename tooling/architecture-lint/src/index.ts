import { layerModel } from "./layers/model.ts";
import { capabilityCitations } from "./rules/capability-citations.ts";
import { layerImports } from "./rules/layer-imports.ts";
import { layerSyntax } from "./rules/layer-syntax.ts";
import { machineTransitions } from "./rules/machine-transitions.ts";
import { ownedInserts } from "./rules/owned-inserts.ts";
import { loadArchitecture, repositoryRoot } from "./workspace.ts";

const { config, workspace } = loadArchitecture();
const model = layerModel(config, workspace);

/** Architecture rules: the layers in architecture.config.json and the AGENTS.md rules. */
export default {
  meta: { name: "architecture" },
  rules: {
    "layer-imports": layerImports(config, model),
    "layer-syntax": layerSyntax(config, model),
    "machine-transitions": machineTransitions,
    "owned-inserts": ownedInserts(repositoryRoot),
    "capability-citations": capabilityCitations,
  },
};
