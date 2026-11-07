import { createFileRoute } from "@tanstack/react-router";

import { authSearch } from "@/lib/auth/navigation";

export const Route = createFileRoute("/_public")({
  validateSearch: authSearch,
});
