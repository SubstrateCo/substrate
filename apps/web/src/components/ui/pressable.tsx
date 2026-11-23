import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const pressableVariants = cva(
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      focus: {
        default: "",
        // For a target that fills a row, so the ring stays inside the row's edge.
        inset: "focus-visible:ring-inset",
        // For the title target of a whole card: the ring covers the nearest positioned ancestor.
        stretched:
          "after:absolute after:inset-0 after:rounded-lg focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50",
      },
    },
    defaultVariants: { focus: "default" },
  },
);

/**
 * A click target with no button chrome: a row or card target, a name that opens a card, or a
 * text-like action. It owns the focus ring and disabled state; the caller styles the rest. Use
 * Button for anything that should look like a button.
 */
function Pressable({
  className,
  focus,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof pressableVariants>) {
  return (
    <button
      data-slot="pressable"
      type={type}
      className={cn(pressableVariants({ focus }), className)}
      {...props}
    />
  );
}

export { Pressable };
