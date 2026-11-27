// Bundlers that target browsers (Metro for react-native-web, Vite) load this entry instead of
// ../index.ts through the "browser" export condition. Keep both entries' exports the same.
export { AgentAvatar } from "./agent-avatar.tsx";
export type { NativeAgentAvatarProps } from "../props.ts";
export type { AgentAvatarHandle } from "../../render/hooks.ts";
export * from "../../config/index.ts";
