import type { AdapterCapabilities } from "@substrate/contracts/harness-runtime";

import type { AcpPeerCapabilities } from "./api.ts";
import type { InitializeResponse as InitializeResponseV2 } from "@agentclientprotocol/sdk/experimental/v2/unstable";
import type { InitializeResponse } from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";

const steeringMeta = z.object({ steering: z.object({ supported: z.literal(true) }) });

/**
 * Reads an ACP v1 initialize result. Evidence, from the installed @agentclientprotocol/sdk
 * 2.8.0 (dist/v1/unstable/schema/types.gen.d.ts):
 * - loadSession: AgentCapabilities.loadSession (:1501).
 * - resume, close, delete, sessionOptions: sessionCapabilities.resume (:1737), .close (:1744),
 *   .delete (:1641), .options (:1714). Present and non-null means supported.
 * - systemPrompt: sessionCapabilities.systemPrompt (:1660) means append; its mode.override
 *   (:1848) adds override.
 * - mcp: mcpCapabilities.http (:1590) and .acp (:1604). Stdio servers need no capability: they
 *   are the baseline McpServer variant (:5513-5519).
 * - logout, authStatus: agentCapabilities.auth.logout (:2053) and .status (:2046).
 * - steering: not in the SDK. claude-agent-acp 0.109.0 advertises its `_session/steering`
 *   extension as InitializeResponse._meta.steering.supported (dist/v1/steering.js:7,
 *   dist/v1/acp-agent.js:601); _meta itself is InitializeResponse._meta (:1478).
 */
export function peerCapabilitiesV1(initialized: InitializeResponse): AcpPeerCapabilities {
  const agent = initialized.agentCapabilities ?? {};
  const session = agent.sessionCapabilities ?? {};
  const steeringSupported = steeringMeta.safeParse(initialized._meta).success;
  return {
    loadSession: agent.loadSession === true,
    resume: session.resume != null,
    close: session.close != null,
    delete: session.delete != null,
    sessionOptions: session.options != null,
    systemPrompt: {
      append: session.systemPrompt != null,
      override: session.systemPrompt?.mode?.override != null,
    },
    mcp: {
      http: agent.mcpCapabilities?.http === true,
      stdio: true,
      acp: agent.mcpCapabilities?.acp === true,
    },
    steering: steeringSupported ? "extension" : "none",
    logout: agent.auth?.logout != null,
    authStatus: agent.auth?.status != null,
  };
}

/**
 * Reads an ACP v2 initialize result. Evidence, from the installed @agentclientprotocol/sdk 2.8.0
 * (dist/v2/unstable/schema/types.gen.d.ts):
 * - capabilities.session (:1819): present means the baseline session/new, list, resume, close,
 *   prompt, cancel and update (:1811-1818). So resume and close need no marker, and loadSession
 *   is session/resume with replayFrom (ResumeSessionRequest.replayFrom :7255).
 * - delete, sessionOptions: session.delete (:1888) and session.options (:1960).
 * - systemPrompt: session.systemPrompt (:1906) means append; its mode.override (:2333) adds
 *   override.
 * - mcp: session.mcp (:1881) with stdio (:2169), http (:2176) and acp (:2189). v2 makes stdio an
 *   explicit marker.
 * - logout: no marker. A non-empty authMethods (:1746, doc :1739-1745) means the agent must
 *   support auth/login and auth/logout. authStatus: capabilities.auth.status (:1828, :2501).
 * - steering: native. A session/prompt sent while foreground work runs is inserted or held and
 *   never rejected for being busy (dist/v2/bindings.d.ts:693-698, :492-501). Its response is the
 *   insertion receipt (PromptResponse.messageId :4309, :4319). Needs capabilities.session.
 */
export function peerCapabilitiesV2(initialized: InitializeResponseV2): AcpPeerCapabilities {
  const capabilities = initialized.capabilities ?? {};
  const session = capabilities.session;
  return {
    loadSession: session != null,
    resume: session != null,
    close: session != null,
    delete: session?.delete != null,
    sessionOptions: session?.options != null,
    systemPrompt: {
      append: session?.systemPrompt != null,
      override: session?.systemPrompt?.mode?.override != null,
    },
    mcp: {
      http: session?.mcp?.http != null,
      stdio: session?.mcp?.stdio != null,
      acp: session?.mcp?.acp != null,
    },
    steering: session != null ? "native" : "none",
    logout: (initialized.authMethods ?? []).length > 0,
    authStatus: capabilities.auth?.status != null,
  };
}

/**
 * Evidence, from the installed @agentclientprotocol/sdk 2.8.0
 * (dist/v1/unstable/schema/types.gen.d.ts):
 * - usage: session/update "usage_update" carries used and size context tokens (:3345, :3837).
 * - noAskProfile: session/request_permission is answered with a reject option
 *   (PermissionOptionKind :661) or the "cancelled" outcome (:6450-6451), and
 *   elicitation/create with the "decline" action (:6603).
 * - compact: the agent lists slash commands in "available_commands_update" (:3337, :3728), and
 *   session/prompt accepts text (:6360). On only when the session lists "compact".
 * - steer, steerEvidence: the `_session/steering` extension (see peerCapabilitiesV1). Its
 *   "injected" outcome is the agent's receipt that the text joined the running turn. On only
 *   when the agent advertises the extension.
 * - interruptReceipt: session/cancel is a notification with no result. Injected steering is
 *   never queued, so nothing can still be queued at an interrupt. Off.
 *
 * The same flags hold on v2 (dist/v2/unstable/schema/types.gen.d.ts): usage_update (:5127),
 * reject options (PermissionOptionKind :1079), the "cancelled" permission outcome (:7639),
 * the "decline" elicitation action (:7703), available_commands_update (:5032). v2 steering is
 * native (see peerCapabilitiesV2): the prompt response's messageId is the receipt. A held
 * steer that the turn outlives is withdrawn with $/cancel_request before the turn ends.
 */
export function adapterCapabilities(
  peer: AcpPeerCapabilities,
  commands: ReadonlySet<string>,
): AdapterCapabilities {
  const steer = peer.steering !== "none";
  return {
    steer,
    steerEvidence: steer,
    compact: commands.has("compact"),
    usage: true,
    noAskProfile: true,
    interruptReceipt: false,
  };
}
