import type { ReactNode } from "react";

import { SegmentedControl } from "../forms/segmented-control";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

const sizingOptions = [
  { value: "fit", label: "Fit whole logo" },
  { value: "fill", label: "Fill square" },
] as const;

const minZoom = 1;
const maxZoom = 3;
const zoomStep = 0.25;

/** Logos choose between keeping the whole image and filling the square. */
export function ImageSizingControl({
  mode,
  onModeChange,
}: {
  mode: "fit" | "fill";
  onModeChange: (mode: "fit" | "fill") => void;
}) {
  return (
    <div className="flex justify-center">
      <SegmentedControl
        aria-label="Logo sizing"
        value={mode}
        options={sizingOptions}
        onValueChange={onModeChange}
      />
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Zoom, rotate, and reset, on one row under the image. Fit mode has nothing to zoom. */
export function ImageCropControls({
  mode,
  zoom,
  onZoomChange,
  onRotate,
  onReset,
}: {
  mode: "fit" | "fill";
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onRotate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {mode === "fill" && (
        <>
          <ToolButton
            label="Zoom out"
            disabled={zoom <= minZoom}
            onClick={() => onZoomChange(Math.max(minZoom, zoom - zoomStep))}
          >
            <ZoomOut aria-hidden="true" />
          </ToolButton>
          <Slider
            aria-label="Zoom"
            className="mx-2 min-w-0 flex-1"
            min={minZoom}
            max={maxZoom}
            step={0.01}
            value={[zoom]}
            onValueChange={(values) => onZoomChange(values[0]!)}
          />
          <ToolButton
            label="Zoom in"
            disabled={zoom >= maxZoom}
            onClick={() => onZoomChange(Math.min(maxZoom, zoom + zoomStep))}
          >
            <ZoomIn aria-hidden="true" />
          </ToolButton>
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5 pl-2">
        <ToolButton label="Rotate 90°" onClick={onRotate}>
          <RotateCw aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Reset" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
        </ToolButton>
      </div>
    </div>
  );
}
