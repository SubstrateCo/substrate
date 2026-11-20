import { createAcpAdapter } from "./adapter.ts";
import type { ConnectAcpAdapter, OpenAcpPeer } from "./api.ts";
import { openAcpPeerWith } from "./peer.ts";

export const openAcpPeer: OpenAcpPeer = (launch, options) => openAcpPeerWith(launch, options);
export const connectAcpAdapter: ConnectAcpAdapter = (options) => createAcpAdapter(options);
export * from "./api.ts";
