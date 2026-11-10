import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

/**
 * What the runtime reported when work stopped. It is a diagnostic, not product copy, so it stays
 * behind a labelled disclosure, wraps, and is never the explanation of the failure.
 */
export function TechnicalDetails({ children }: { children: string }) {
  return (
    <Collapsible className="group/details min-w-0">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="disclosure" size="xs" className="-ml-1">
          <ChevronRight
            aria-hidden="true"
            className="transition-transform duration-150 ease-out group-data-[state=open]/details:rotate-90 motion-reduce:transition-none"
          />
          Technical details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs wrap-anywhere whitespace-pre-wrap text-muted-foreground">
          {children}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
