import { useHeaderContext } from "./table";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

const sortIcons = { asc: ArrowUp, desc: ArrowDown };

export function SortHeader() {
  const header = useHeaderContext();
  const sorting = header.column.getIsSorted();
  const Icon = sorting ? sortIcons[sorting] : ArrowUpDown;
  return (
    <Button
      type="button"
      variant="disclosure"
      size="xs"
      className="-ml-2"
      onClick={header.column.getToggleSortingHandler()}
    >
      <header.FlexRender />
      <Icon aria-hidden="true" />
    </Button>
  );
}
