import { createFileRoute } from "@tanstack/react-router";
import { UserAppearance } from "@/components/settings/user-appearance";

export const Route = createFileRoute("/_authenticated/settings/user/")({
  component: UserAppearance,
});
