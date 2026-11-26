import { metrics } from "@substrate/design-tokens";

import { useEffect, useState } from "react";

import { useSafeAreaInsets } from "react-native-safe-area-context";

function keyboardHeight() {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  return viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
}

export function useToastOffset() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(keyboardHeight);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setHeight(keyboardHeight());
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
  return metrics.spacing.unit * 20 + Math.max(insets.bottom, height);
}
