import { useState } from "react";

import {
  AgentAvatar,
  generateAvatar,
  type AmbientLevel,
  type AvatarConfig,
} from "../../src/index.ts";

const STARTING_NAMES = [
  "Scout",
  "Ledger",
  "Harbor",
  "Quill",
  "Nova",
  "Bramble",
  "Echo",
  "Tally",
  "Orbit",
  "Sprout",
  "Cobalt",
  "Mosaic",
];

const randomName = () => `agent-${Math.random().toString(36).slice(2, 8)}`;

interface GalleryProps {
  onPick: (config: AvatarConfig) => void;
  outline: boolean;
  ambient: AmbientLevel;
}

export function Gallery({ onPick, outline, ambient }: GalleryProps) {
  const [names, setNames] = useState(STARTING_NAMES);
  const [draft, setDraft] = useState("");

  return (
    <>
      <div className="gallery-header">
        <h2>Generated from a seed</h2>
        <form
          className="gallery-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) setNames([draft.trim(), ...names]);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type an agent name or id"
          />
          <button type="submit" className="gesture">
            Generate
          </button>
          <button
            type="button"
            className="gesture"
            onClick={() => setNames(Array.from({ length: 12 }, randomName))}
          >
            Shuffle
          </button>
        </form>
      </div>
      <p className="hint">The same seed always gives the same avatar. Click one to edit it.</p>
      <div className="board">
        {names.map((name, i) => {
          const config = generateAvatar(name);
          return (
            <button
              key={`${name}-${i}`}
              type="button"
              className="board-item"
              onClick={() => onPick(config)}
            >
              <AgentAvatar
                {...config}
                seed={name}
                size={72}
                outline={outline}
                ambient={ambient}
                followPointer
                sleepAfter={8000 + i * 700}
                drowsyFor={3000}
              />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
