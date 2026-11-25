import { useTheme } from "@/components/theme/theme-provider";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "cn";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      mobileOffset={{
        top: "max(1rem, env(safe-area-inset-top))",
        right: "max(1rem, env(safe-area-inset-right))",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        left: "max(1rem, env(safe-area-inset-left))",
      }}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-accent-foreground" />,
        warning: <TriangleAlertIcon className="size-4 text-accent-foreground" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // SAFETY: These CSS custom properties contain valid CSS strings consumed by Sonner.
      style={
        {
          fontFamily: "var(--font-sans)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast flex w-(--width) flex-wrap items-center gap-2 rounded-lg bg-popover p-4 pr-12 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 focus-visible:shadow-floating! focus-visible:outline-2! focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-expanded=false][data-front=false]>*]:opacity-0",
          content: "flex min-w-0 flex-1 basis-[calc(100%-1.5rem)] flex-col gap-0.5",
          title: "text-sm leading-5 font-medium",
          description: "text-sm leading-5 text-muted-foreground!",
          icon: "flex size-4 shrink-0 items-center justify-center",
          actionButton: cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-auto min-h-8 max-w-full min-w-0 py-1 wrap-anywhere whitespace-normal sm:min-h-7",
          ),
          cancelButton: cn(
            buttonVariants({ variant: "accent", size: "sm" }),
            "h-auto min-h-8 max-w-full min-w-0 py-1 wrap-anywhere whitespace-normal sm:min-h-7",
          ),
          closeButton: cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "absolute top-2 right-2 size-8 text-muted-foreground sm:size-6",
          ),
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
