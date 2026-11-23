import { Button } from "../ui/button";
import { useHeaderContext } from "./table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/** A sortable column label. The negative margin keeps the label at the cells' left edge. */
export function SortHeader() {
  const header = useHeaderContext();
  const sorting = header.column.getIsSorted();
  let Icon = ArrowUpDown;
  if (sorting === "asc") Icon = ArrowUp;
  else if (sorting === "desc") Icon = ArrowDown;
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
