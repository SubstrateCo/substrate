import {
  AMBIENT_LEVELS,
  GESTURES,
  MOODS,
  type AmbientLevel,
  type Gesture,
  type Mood,
} from "../../src/index.ts";
import { label } from "./label.ts";

export interface Behaviour {
  space: boolean;
  followPointer: boolean;
  followFocus: boolean;
  outline: boolean;
  dark: boolean;
  speaking: boolean;
  interactive: boolean;
  sleepAfter: number;
  ambient: AmbientLevel;
}

const TOGGLES: { key: keyof Behaviour; text: string }[] = [
  { key: "space", text: "Float in space" },
  { key: "followPointer", text: "Follow pointer" },
  { key: "followFocus", text: "Follow focus" },
  { key: "interactive", text: "Pokes and petting" },
  { key: "outline", text: "Outline" },
  { key: "dark", text: "Dark background" },
  { key: "speaking", text: "Speaking" },
];

const SLEEP_OPTIONS = [
  { value: 0, text: "Never" },
  { value: 3000, text: "After 3 s" },
  { value: 10_000, text: "After 10 s" },
  { value: 60_000, text: "After 1 min" },
];

interface BehaviourPanelProps {
  mood: Mood;
  onMood: (mood: Mood) => void;
  behaviour: Behaviour;
  onBehaviour: (behaviour: Behaviour) => void;
  onGesture: (gesture: Gesture) => void;
}

export function BehaviourPanel({
  mood,
  onMood,
  behaviour,
  onBehaviour,
  onGesture,
}: BehaviourPanelProps) {
  return (
    <section className="card">
      <div className="segmented" role="tablist" aria-label="Mood">
        {MOODS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === mood}
            className={name === mood ? "segment selected" : "segment"}
            onClick={() => onMood(name)}
          >
            {label(name)}
          </button>
        ))}
      </div>
      <div className="gestures">
        {GESTURES.map((name) => (
          <button key={name} type="button" className="gesture" onClick={() => onGesture(name)}>
            {label(name)}
          </button>
        ))}
      </div>
      <div className="toggles">
        {TOGGLES.map(({ key, text }) => (
          <label key={key} className="toggle">
            <input
              type="checkbox"
              checked={Boolean(behaviour[key])}
              onChange={(event) => onBehaviour({ ...behaviour, [key]: event.target.checked })}
            />
            {text}
          </label>
        ))}
        <label className="toggle">
          Falls asleep
          <select
            value={behaviour.sleepAfter}
            onChange={(event) =>
              onBehaviour({ ...behaviour, sleepAfter: Number(event.target.value) })
            }
          >
            {SLEEP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.text}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="toggle unprompted">
        Unprompted actions
        <select
          value={behaviour.ambient}
          onChange={(event) => {
            const ambient = AMBIENT_LEVELS.find((level) => level === event.target.value);
            if (ambient) onBehaviour({ ...behaviour, ambient });
          }}
        >
          {AMBIENT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {label(level)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">Sleep works in the Waiting mood. Any pointer, key or scroll wakes it.</p>
    </section>
  );
}
