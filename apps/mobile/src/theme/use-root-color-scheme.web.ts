import { useLayoutEffect } from "react";

import type { ColorScheme } from "./navigation";

export function useRootColorScheme(colorScheme: ColorScheme) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", colorScheme === "dark");
    document.documentElement.style.colorScheme = colorScheme;
  }, [colorScheme]);
}
