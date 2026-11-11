import type { PictureKind } from "@substrate/contracts/files/pictures";

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
function ImageSizingControl({
  mode,
  onModeChange,
}: {
  mode: "fit" | "fill";
  onModeChange: (mode: "fit" | "fill") => void;
}) {
  return (
    <div>
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
  kind,
  mode,
  zoom,
  onModeChange,
  onZoomChange,
  onRotate,
  onReset,
}: {
  kind: PictureKind;
  mode: "fit" | "fill";
  zoom: number;
  onModeChange: (mode: "fit" | "fill") => void;
  onZoomChange: (zoom: number) => void;
  onRotate: (degrees: number) => void;
  onReset: () => void;
}) {
  const zoomControl = (
    <div className="flex min-w-0 flex-1 items-center">
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
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        {kind === "organization-logo" ? (
          <ImageSizingControl mode={mode} onModeChange={onModeChange} />
        ) : (
          zoomControl
        )}
        <div className="ml-auto flex items-center gap-0.5 pl-2">
          <ToolButton label="Rotate left" onClick={() => onRotate(-90)}>
            <RotateCcw aria-hidden="true" />
          </ToolButton>
          <ToolButton label="Rotate right" onClick={() => onRotate(90)}>
            <RotateCw aria-hidden="true" />
          </ToolButton>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            Reset
          </Button>
        </div>
      </div>
      {kind === "organization-logo" && mode === "fill" && zoomControl}
    </div>
  );
}
