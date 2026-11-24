import { useQuery } from "@tanstack/react-query";

import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import type { MeetingQueries } from "@/queries/meetings/options";

export function OriginalText({ id, queries }: { id: string; queries: MeetingQueries }) {
  const r = useQuery(queries.original(id));
  if (isAccessFailure(r.error) || (r.isSuccess && r.data === null))
    return <ContentNotice variant="inline" title="Original unavailable" />;
  if (r.error)
    return (
      <ErrorState inline title="Couldn’t read the original" onRetry={() => void r.refetch()} />
    );
  if (r.isPending) return <LoadingState label="Reading original" variant="compact" />;
  return (
    <CodeBlock size="sm">
      <CodeBlockContent wrap className="max-h-80">
        {r.data}
      </CodeBlockContent>
    </CodeBlock>
  );
}
