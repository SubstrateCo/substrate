import { useEffect, useMemo, useState } from "react";

import { AgentAvatar, generateAvatar, MOODS, type AmbientLevel } from "../../src/index.ts";
import { frameStats } from "../../src/runtime/ticker.ts";

const COUNTS = [0, 50, 100, 200, 400];
const SIZES = [24, 40, 72];

/** Frames per second and the shared loop's script cost, sampled twice a second. */
function useFrameMeter() {
  const [reading, setReading] = useState({ fps: 0, cost: 0, running: 0 });
  useEffect(() => {
    let frames = 0;
    let handle = requestAnimationFrame(function count() {
      frames++;
      handle = requestAnimationFrame(count);
    });
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const stats = frameStats();
      setReading({
        fps: Math.round((frames * 1000) / (now - last)),
        cost: stats.cost,
        running: stats.running,
      });
      frames = 0;
      last = now;
    }, 500);
    return () => {
      cancelAnimationFrame(handle);
      clearInterval(timer);
    };
  }, []);
  return reading;
}

export function StressTest({ outline, ambient }: { outline: boolean; ambient: AmbientLevel }) {
  const [count, setCount] = useState(0);
  const [size, setSize] = useState(40);
  const meter = useFrameMeter();
  const crowd = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        seed: `crowd-${i}`,
        config: generateAvatar(`crowd-${i}`),
        mood: MOODS[i % MOODS.length] ?? "waiting",
      })),
    [count],
  );

  return (
    <>
      <div className="gallery-header">
        <h2>Stress test</h2>
        <div className="stress-controls">
          <div className="segmented compact" role="radiogroup" aria-label="Avatars">
            {COUNTS.map((value) => (
              <button
                key={value}
                type="button"
                className={value === count ? "segment selected" : "segment"}
                onClick={() => setCount(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="segmented compact" role="radiogroup" aria-label="Size">
            {SIZES.map((value) => (
              <button
                key={value}
                type="button"
                className={value === size ? "segment selected" : "segment"}
                onClick={() => setSize(value)}
              >
                {value}px
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="hint" data-testid="frame-meter">
        {meter.fps} fps · loop {meter.cost.toFixed(2)} ms per frame · {meter.running} animating
      </p>
      <div className="crowd">
        {crowd.map((member) => (
          <AgentAvatar
            key={member.seed}
            {...member.config}
            seed={member.seed}
            mood={member.mood}
            size={size}
            outline={outline}
            ambient={ambient}
            interactive
            followPointer
          />
        ))}
      </div>
    </>
  );
}
