import { useMemo, useRef, type RefObject } from "react";

import {
  AgentAvatar,
  generateAvatar,
  type AgentAvatarHandle,
  type AvatarConfig,
  type Mood,
} from "../../src/index.ts";
import type { Behaviour } from "./behaviour-panel.tsx";

/**
 * Bystanders watch the hero. On the floor they stand further back; in space they hang at
 * different depths, so the far ones are smaller and softer.
 */
const CROWD = [
  { seed: "atlas", left: "14%", depth: 0.55, floatTop: "18%" },
  { seed: "juniper", left: "82%", depth: 0.5, floatTop: "24%" },
  { seed: "pixel", left: "28%", depth: 0.3, floatTop: "62%" },
  { seed: "moth", left: "70%", depth: 0.25, floatTop: "66%" },
];

interface StageProps {
  avatarRef: RefObject<AgentAvatarHandle | null>;
  config: AvatarConfig;
  mood: Mood;
  behaviour: Behaviour;
}

export function Stage({ avatarRef, config, mood, behaviour }: StageProps) {
  const hero = useRef<HTMLDivElement>(null);
  const crowd = useMemo(
    () => CROWD.map((member) => ({ ...member, config: generateAvatar(member.seed) })),
    [],
  );
  const world = behaviour.space ? "space" : "floor";

  return (
    <section className="card stage-card">
      <div className={behaviour.space ? "stage space" : "stage"}>
        {behaviour.space ? <div className="stage-stars" /> : <div className="stage-floor" />}
        {crowd.map((member) => (
          <div
            key={member.seed}
            className="stage-actor"
            style={{
              left: member.left,
              ...(behaviour.space
                ? { top: member.floatTop }
                : { bottom: `${18 + member.depth * 40}%` }),
              filter: `blur(${member.depth * 1.2}px)`,
            }}
          >
            <AgentAvatar
              {...member.config}
              world={world}
              ambient={behaviour.ambient}
              size={Math.round(130 * (1 - member.depth))}
              lookAt={hero}
              sleepAfter={12_000}
              interactive
              outline={behaviour.outline}
            />
          </div>
        ))}
        <div ref={hero} className="stage-actor hero">
          <AgentAvatar
            ref={avatarRef}
            {...config}
            mood={mood}
            world={world}
            ambient={behaviour.ambient}
            size={240}
            interactive={behaviour.interactive}
            followPointer={behaviour.followPointer ? 900 : false}
            followFocus={behaviour.followFocus}
            speaking={behaviour.speaking}
            sleepAfter={behaviour.sleepAfter}
            drowsyFor={4000}
            outline={behaviour.outline}
            label="Playground avatar"
          />
        </div>
      </div>
    </section>
  );
}
