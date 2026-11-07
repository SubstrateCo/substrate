import { useId } from "react";

import { Button } from "../primitives/button";

export function ImageCropControls({
  kind,
  mode,
  zoom,
  onModeChange,
  onZoomChange,
  onRotate,
  onReset,
}: {
  kind: "avatar" | "organization-logo";
  mode: "fit" | "fill";
  zoom: number;
  onModeChange: (mode: "fit" | "fill") => void;
  onZoomChange: (zoom: number) => void;
  onRotate: () => void;
  onReset: () => void;
}) {
  const id = useId();
  return (
    <>
      {kind === "organization-logo" && (
        <div className="flex gap-2" role="group" aria-label="Logo sizing">
          <Button
            type="button"
            variant="outline"
            aria-pressed={mode === "fit"}
            onClick={() => onModeChange("fit")}
          >
            Fit whole logo
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={mode === "fill"}
            onClick={() => onModeChange("fill")}
          >
            Fill square
          </Button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <label htmlFor={id}>Zoom</label>
        <input
          id={id}
          className="min-w-0 flex-1 accent-primary"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          disabled={mode === "fit"}
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onRotate}>
          Rotate 90°
        </Button>
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset
        </Button>
      </div>
    </>
  );
}
