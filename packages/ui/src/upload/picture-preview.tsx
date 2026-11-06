import { useState, type ReactNode } from "react";

export function PicturePreview({
  src,
  fallback,
  className,
}: {
  src?: string | null;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return <img src={src} alt="" className={className} onError={() => setFailed(src)} />;
}
