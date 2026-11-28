import { useState, type ReactNode } from "react";

import { cn } from "cn";

function Image({
  src,
  darkSrc,
  fallback = null,
  alt = "",
  className,
  onError,
  ...props
}: Omit<React.ComponentProps<"img">, "src"> & {
  src?: string | null;
  darkSrc?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return fallback;
  const image = (source: string, mode?: string) => (
    <img
      data-slot="image"
      src={source}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(mode, className)}
      onError={(event) => {
        setFailed(src);
        onError?.(event);
      }}
      {...props}
    />
  );
  if (!darkSrc) return image(src);
  return (
    <>
      {image(src, "dark:hidden")}
      {image(darkSrc, "hidden dark:block")}
    </>
  );
}

export { Image };
