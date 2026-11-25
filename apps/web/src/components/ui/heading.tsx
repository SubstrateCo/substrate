import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const headingVariants = cva("", {
  variants: {
    variant: {
      page: "text-xl font-medium",
      record: "text-lg/snug font-medium wrap-break-word",
      section: "text-base font-medium",
      title: "text-sm font-medium",
      label: "text-xs font-medium text-muted-foreground",
      // Takes its type from the container, such as CardTitle, EmptyTitle, or a disclosure trigger.
      inherit: "",
    },
  },
  defaultVariants: { variant: "title" },
});

/**
 * A document heading. `level` sets the outline (`h1`-`h6`); `variant` sets the type role, so an
 * `h3` can read as a card title and an `h2` as a group label.
 */
function Heading({
  level,
  variant = "title",
  className,
  ...props
}: React.ComponentProps<"h2"> &
  VariantProps<typeof headingVariants> & { level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      data-slot="heading"
      data-variant={variant}
      className={cn(headingVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Heading, headingVariants };
