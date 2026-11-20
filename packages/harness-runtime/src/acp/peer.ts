import { HarnessError, unsupported } from "../errors.ts";
import type { AcpLaunch, AcpPeer } from "./api.ts";
import { connectAcp, type AcpConnectDeps } from "./connection.ts";
import type { AcpDriverHandlers } from "./driver.ts";

/** A peer has no turn: every agent request gets the no-ask answer, and updates are dropped. */
const noAsk: AcpDriverHandlers = {
  update: () => {},
  request: async (request) => request.deny(),
};

export async function openAcpPeerWith(
  launch: AcpLaunch,
  options: { cwd: string; signal: AbortSignal },
  deps: AcpConnectDeps = {},
): Promise<AcpPeer> {
  const live = await connectAcp(launch, options.cwd, noAsk, options.signal, deps);
  const connection = live.connection;
  const capabilities = connection.capabilities;
  return {
    launch,
    protocolVersion: connection.protocolVersion,
    agentInfo: connection.agentInfo,
    capabilities,
    authMethods: connection.authMethods,
    probeConfigOptions: async (cwd, signal) => {
      if (capabilities.sessionOptions) return connection.sessionOptions(cwd, signal);
      const opened = await connection.newSession({ cwd, mcpServers: [] }, signal);
      try {
        return opened.configOptions;
      } finally {
        if (capabilities.close)
          await connection.closeSession(opened.sessionId, signal).catch(() => {});
        if (capabilities.delete)
          await connection.deleteSession(opened.sessionId, signal).catch(() => {});
      }
    },
    authenticate: async (methodId, signal) => {
      const method = connection.authMethods.find((entry) => entry.id === methodId);
      if (!method)
        throw new HarnessError(
          "invalid-command",
          `The agent offers no sign-in method ${methodId}.`,
        );
      // AuthMethodTerminal: the client MUST NOT pass it to authenticate
      // (dist/v1/unstable/schema/types.gen.d.ts:2148).
      if (method.type === "terminal")
        unsupported("Run terminal sign-in in a terminal with the method's launch args.");
      await connection.authenticate(methodId, signal);
    },
    logout: async (signal) => {
      if (!capabilities.logout) unsupported("The agent does not support logout.");
      await connection.logout(signal);
    },
    close: () => live.close(),
  };
}
