import { ruleTester } from "../test-support.ts";
import { capabilityCitations } from "./capability-citations.ts";

const capabilities = (docs: string, flags: string) =>
  `${docs}\nexport const fakeCapabilities: AdapterCapabilities = { ${flags} };`;

ruleTester.run("capability-citations", capabilityCitations, {
  valid: [
    capabilities("/** No evidence yet. */", "steer: false, usage: false"),
    capabilities(
      "/**\n * Evidence from sdk 1.0 (dist/types.d.ts):\n * - steer: SessionPromptInput has `delivery` (:4179).\n * - usage: result usage (sdk.d.ts:6037-6041).\n */",
      "steer: true, usage: true, compact: false",
    ),
    capabilities(
      "/**\n * - steer, usage: the inbox API\n *   (types.d.ts:115).\n */",
      "steer: true, usage: true",
    ),
    "const flags: Flags = { steer: true };",
  ],
  invalid: [
    {
      code: capabilities(
        "/**\n * - usage: result usage (sdk.d.ts:6037).\n */",
        "steer: true, usage: true",
      ),
      errors: [{ messageId: "missing", data: { flag: "steer" } }],
    },
    {
      code: capabilities(
        '/**\n * - noAskProfile: approvals use approvalPolicy "never" (protocol schema v2).\n */',
        "noAskProfile: true",
      ),
      errors: [{ messageId: "uncited", data: { flag: "noAskProfile" } }],
    },
  ],
});
