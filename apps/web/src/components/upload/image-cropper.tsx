import type { PictureKind } from "@substrate/contracts/files/pictures";

import type { CropArea } from "./crop-image";
import "react-easy-crop/react-easy-crop.css";
import Cropper from "react-easy-crop";

export interface ImageCropperProps {
  src: string;
  kind: PictureKind;
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  mode: "fit" | "fill";
  onCropChange: (crop: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (area: CropArea) => void;
  onError?: () => void;
}

export function ImageCropper({
  src,
  kind,
  crop,
  zoom,
  rotation,
  mode,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onError,
}: ImageCropperProps) {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-crop-preview overflow-hidden rounded-lg border border-border bg-muted"
      role="group"
      aria-label="Image crop preview"
    >
      {mode === "fit" ? (
        <img
          src={src}
          alt="Logo fit preview"
          className="size-full rotate-(--rotation) object-contain"
          style={{ "--rotation": `${rotation}deg` }}
          onError={onError}
        />
      ) : (
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          // The third-party API names this prop cropShape.
          // oxlint-disable-next-line deslop/no-shape-in-symbol-names
          cropShape={kind === "avatar" ? "round" : "rect"}
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={(_, pixels) => onCropComplete(pixels)}
          mediaProps={{ onError }}
          cropperProps={{ "aria-label": "Position image with arrow keys" }}
          disableAutomaticStylesInjection
          keyboardStep={10}
        />
      )}
    </div>
  );
}
