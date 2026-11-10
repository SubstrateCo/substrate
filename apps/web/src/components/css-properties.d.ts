import "react";

declare module "react" {
  interface CSSProperties {
    /** Custom properties carry run-time values to classes, such as `rotate-(--rotation)`. */
    [property: `--${string}`]: string | number | undefined;
  }
}
