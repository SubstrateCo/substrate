import type { ToastOptions } from "./session";
import { toast } from "sonner";

export const toastDriver = {
  success: (title: string, options?: ToastOptions) => toast.success(title, options),
  error: (title: string, options?: ToastOptions) => toast.error(title, options),
  dismiss: () => toast.dismiss(),
};
