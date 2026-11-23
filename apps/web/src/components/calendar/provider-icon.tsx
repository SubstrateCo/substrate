import type { CalendarProvider } from "@substrate/contracts/calendar";

import google from "./icons/google.svg";
import { Image } from "@/components/ui/image";
import { CalendarDays } from "lucide-react";

/** A calendar provider's mark. Decorative: the provider's name sits beside it. */
export function ProviderIcon({ provider }: { provider: CalendarProvider }) {
  if (provider === "google")
    return <Image src={google} aria-hidden="true" className="size-4 shrink-0" />;
  return <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
}
