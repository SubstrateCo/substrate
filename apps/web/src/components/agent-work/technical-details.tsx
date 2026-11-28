import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

export function TechnicalDetails({ children }: { children: string }) {
  return (
    <Collapsible className="group/details min-w-0">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="disclosure" size="xs" className="-ml-2">
          <ChevronRight
            aria-hidden="true"
            className="transition-transform duration-150 ease-out group-data-[state=open]/details:rotate-90 motion-reduce:transition-none"
          />
          Technical details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CodeBlock size="sm" variant="muted" className="mt-1.5">
          <CodeBlockContent wrap className="max-h-40">
            {children}
          </CodeBlockContent>
        </CodeBlock>
      </CollapsibleContent>
    </Collapsible>
  );
}
