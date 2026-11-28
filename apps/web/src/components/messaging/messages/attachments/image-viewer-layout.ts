type Size = { width: number; height: number };

export function fitViewerImage(image: Size, viewport: Size, rotation: number, zoom: number) {
  const sideways = Math.abs(rotation % 180) === 90;
  const rotatedWidth = sideways ? image.height : image.width;
  const rotatedHeight = sideways ? image.width : image.height;
  const scale =
    rotatedWidth && rotatedHeight
      ? Math.min(viewport.width / rotatedWidth, viewport.height / rotatedHeight, 1) * zoom
      : 0;
  return {
    imageWidth: image.width * scale,
    imageHeight: image.height * scale,
    width: Math.max(viewport.width, rotatedWidth * scale),
    height: Math.max(viewport.height, rotatedHeight * scale),
  };
}
