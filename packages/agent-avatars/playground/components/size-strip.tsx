import { AgentAvatar, type AvatarConfig, type Mood } from "../../src/index.ts";

const SIZES = [16, 20, 24, 32, 48, 72, 96];

interface SizeStripProps {
  config: AvatarConfig;
  mood: Mood;
  outline: boolean;
}

export function SizeStrip({ config, mood, outline }: SizeStripProps) {
  return (
    <div className="size-strip">
      {SIZES.map((size) => (
        <figure key={size}>
          <AgentAvatar {...config} mood={mood} size={size} outline={outline} interactive />
          <figcaption>{size}px</figcaption>
        </figure>
      ))}
    </div>
  );
}
