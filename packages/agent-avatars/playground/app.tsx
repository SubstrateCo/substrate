import { useRef, useState } from "react";

import {
  DEFAULT_CONFIG,
  type AgentAvatarHandle,
  type AvatarConfig,
  type Mood,
} from "../src/index.ts";
import { AppearancePanel } from "./components/appearance-panel.tsx";
import { BehaviourPanel, type Behaviour } from "./components/behaviour-panel.tsx";
import { Gallery } from "./components/gallery.tsx";
import { MoodBoard } from "./components/mood-board.tsx";
import { SizeStrip } from "./components/size-strip.tsx";
import { Stage } from "./components/stage.tsx";
import { StressTest } from "./components/stress-test.tsx";
import { UsageSnippet } from "./components/usage-snippet.tsx";

const INITIAL_BEHAVIOUR: Behaviour = {
  space: true,
  followPointer: true,
  followFocus: true,
  outline: false,
  dark: false,
  speaking: false,
  interactive: true,
  sleepAfter: 0,
  ambient: "lively",
};

export function App() {
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_CONFIG);
  const [mood, setMood] = useState<Mood>("waiting");
  const [behaviour, setBehaviour] = useState(INITIAL_BEHAVIOUR);
  const avatar = useRef<AgentAvatarHandle>(null);

  return (
    <div className={behaviour.dark ? "page dark" : "page"}>
      <header className="page-header">
        <h1>Agent avatars</h1>
        <p>Poke the big one, stroke it, or leave the page alone and watch it fall asleep.</p>
      </header>
      <main className="layout">
        <Stage avatarRef={avatar} config={config} mood={mood} behaviour={behaviour} />
        <BehaviourPanel
          mood={mood}
          onMood={setMood}
          behaviour={behaviour}
          onBehaviour={setBehaviour}
          onGesture={(gesture) => avatar.current?.play(gesture)}
        />
        <AppearancePanel config={config} onChange={setConfig} outline={behaviour.outline} />
        <section className="card wide">
          <h2>Sizes</h2>
          <SizeStrip config={config} mood={mood} outline={behaviour.outline} />
          <UsageSnippet config={config} mood={mood} />
        </section>
        <section className="card wide">
          <h2>Every mood</h2>
          <MoodBoard config={config} outline={behaviour.outline} onPick={setMood} />
        </section>
        <section className="card wide">
          <Gallery onPick={setConfig} outline={behaviour.outline} ambient={behaviour.ambient} />
        </section>
        <section className="card wide">
          <StressTest outline={behaviour.outline} ambient={behaviour.ambient} />
        </section>
      </main>
    </div>
  );
}
