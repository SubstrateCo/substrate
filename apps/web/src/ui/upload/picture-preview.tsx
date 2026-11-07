import { useState, type ReactNode } from "react";

export function PicturePreview({
  src,
  fallback,
  className,
  alt = "",
}: {
  src?: string | null;
  fallback: ReactNode;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(src)} />;
}
