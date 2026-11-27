import {
  AgentAvatar,
  BODY_COLORS,
  EYE_COLORS,
  EYE_STYLES,
  FILLS,
  BODIES,
  type AvatarConfig,
} from "../../src/index.ts";
import { label } from "./label.ts";

interface AppearancePanelProps {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
  outline: boolean;
}

const isHex = (value: string) => value.startsWith("#");

export function AppearancePanel({ config, onChange, outline }: AppearancePanelProps) {
  const set = (patch: Partial<AvatarConfig>) => onChange({ ...config, ...patch });
  const customBody = isHex(config.color);

  return (
    <section className="card">
      <h2>Shape</h2>
      <div className="tiles">
        {BODIES.map((body) => (
          <button
            key={body}
            type="button"
            className={body === config.body ? "tile selected" : "tile"}
            onClick={() => set({ body })}
            title={label(body)}
          >
            <AgentAvatar {...config} body={body} size={44} animated={false} outline={outline} />
            <span>{label(body)}</span>
          </button>
        ))}
      </div>

      <h2>Colour</h2>
      <div className="swatches">
        {Object.entries(BODY_COLORS).map(([name, colors]) => (
          <button
            key={name}
            type="button"
            title={label(name)}
            className={name === config.color ? "swatch selected" : "swatch"}
            style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
            onClick={() => set({ color: name, secondaryColor: undefined })}
          />
        ))}
        <label className={customBody ? "custom-color selected" : "custom-color"}>
          Custom
          <input
            type="color"
            value={customBody ? config.color : "#7c5cff"}
            onChange={(event) => set({ color: event.target.value })}
          />
          <input
            type="color"
            aria-label="Gradient end"
            value={config.secondaryColor ?? "#2b1d7a"}
            disabled={!customBody || config.fill === "solid"}
            onChange={(event) => set({ secondaryColor: event.target.value })}
          />
        </label>
      </div>

      <h2>Fill</h2>
      <div className="segmented compact">
        {FILLS.map((fill) => (
          <button
            key={fill}
            type="button"
            className={fill === config.fill ? "segment selected" : "segment"}
            onClick={() => set({ fill })}
          >
            {label(fill)}
          </button>
        ))}
      </div>

      <h2>Eyes</h2>
      <div className="tiles">
        {EYE_STYLES.map((eyes) => (
          <button
            key={eyes}
            type="button"
            className={eyes === config.eyes ? "tile selected" : "tile"}
            onClick={() => set({ eyes })}
          >
            <AgentAvatar {...config} eyes={eyes} size={44} animated={false} outline={outline} />
            <span>{label(eyes)}</span>
          </button>
        ))}
      </div>

      <h2>Eye colour</h2>
      <div className="swatches">
        {Object.entries(EYE_COLORS).map(([name, value]) => (
          <button
            key={name}
            type="button"
            title={label(name)}
            className={name === config.eyeColor ? "swatch selected" : "swatch"}
            style={{ background: value }}
            onClick={() => set({ eyeColor: name })}
          />
        ))}
        <label className={isHex(config.eyeColor) ? "custom-color selected" : "custom-color"}>
          Custom
          <input
            type="color"
            value={isHex(config.eyeColor) ? config.eyeColor : "#ffffff"}
            onChange={(event) => set({ eyeColor: event.target.value })}
          />
        </label>
      </div>
    </section>
  );
}
