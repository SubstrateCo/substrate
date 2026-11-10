import type { ReactNode } from "react";

import { AuthFrame } from "../auth/auth-frame";
import { NonWorkspaceLayout } from "../theme/non-workspace-layout";
import { Button } from "../ui/button";

/** Full-page not-found screen in the guest frame. `homeLink` is the single primary action. */
export function NotFound({ homeLink }: { homeLink: ReactNode }) {
  return (
    <NonWorkspaceLayout>
      <AuthFrame
        title="Page not found"
        description="This page may have moved, or the link may be wrong."
      >
        <Button asChild size="lg" className="w-full">
          {homeLink}
        </Button>
      </AuthFrame>
    </NonWorkspaceLayout>
  );
}
