import type { PictureKind } from "@substrate/contracts/files/pictures";

import { Image } from "../ui/image";
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
      className="relative mx-auto aspect-square w-full max-w-crop-preview overflow-hidden rounded-lg border bg-muted"
      role="group"
      aria-label="Image crop preview"
    >
      {mode === "fit" ? (
        <Image
          src={src}
          alt="Logo fit preview"
          loading="eager"
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
          classes={{ cropAreaClassName: kind === "avatar" ? "rounded-full" : undefined }}
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
