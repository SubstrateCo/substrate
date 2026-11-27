import { AgentAvatar, MOODS, type AvatarConfig, type Mood } from "../../src/index.ts";
import { label } from "./label.ts";

interface MoodBoardProps {
  config: AvatarConfig;
  outline: boolean;
  onPick: (mood: Mood) => void;
}

export function MoodBoard({ config, outline, onPick }: MoodBoardProps) {
  return (
    <div className="board">
      {MOODS.map((mood) => (
        <button key={mood} type="button" className="board-item" onClick={() => onPick(mood)}>
          <AgentAvatar {...config} mood={mood} size={72} outline={outline} />
          <span>{label(mood)}</span>
        </button>
      ))}
    </div>
  );
}
