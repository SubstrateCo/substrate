import type { AvatarConfig, Mood } from "../../src/index.ts";

interface UsageSnippetProps {
  config: AvatarConfig;
  mood: Mood;
}

export function UsageSnippet({ config, mood }: UsageSnippetProps) {
  const attributes = [
    `body="${config.body}"`,
    `color="${config.color}"`,
    config.secondaryColor ? `secondaryColor="${config.secondaryColor}"` : null,
    `fill="${config.fill}"`,
    `eyes="${config.eyes}"`,
    `eyeColor="${config.eyeColor}"`,
    `mood="${mood}"`,
  ];
  return <pre className="snippet">{`<AgentAvatar ${attributes.filter(Boolean).join(" ")} />`}</pre>;
}
