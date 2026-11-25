import { AuthFrame } from "../auth/auth-frame";
import { NonWorkspaceLayout } from "../theme/non-workspace-layout";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <NonWorkspaceLayout>
      <AuthFrame
        title="Something went wrong"
        description={<span role="alert">We couldn’t load this page. Please try again.</span>}
      >
        <Button type="button" size="lg" className="w-full" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </AuthFrame>
    </NonWorkspaceLayout>
  );
}
