import { useEffect, useRef, type ReactNode } from "react";

export function LinkedMessage({
  highlighted,
  children,
}: {
  highlighted: boolean;
  children: ReactNode;
}) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) target.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);
  return (
    <div
      ref={target}
      tabIndex={highlighted ? -1 : undefined}
      aria-label={highlighted ? "Linked message" : undefined}
    >
      {children}
    </div>
  );
}
