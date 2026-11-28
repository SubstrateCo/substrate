import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const textLinkVariants = cva(
  "rounded-sm underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default: "text-primary underline decoration-primary/40 hover:decoration-current",
        quiet: "hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/**
 * A link to a page outside the app. It opens in a new tab (the system browser on desktop) and
 * never passes the opener or referrer. In-app links are router `Link`s.
 */
function TextLink({
  className,
  variant,
  ...props
}: Omit<React.ComponentProps<"a">, "target" | "rel"> & VariantProps<typeof textLinkVariants>) {
  return (
    <a
      data-slot="text-link"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(textLinkVariants({ variant }), className)}
      {...props}
    />
  );
}

export { TextLink };
