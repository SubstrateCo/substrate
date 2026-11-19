import { mutationOptions } from "@tanstack/react-query";

/** Discard completed auth attempts once unobserved; inputs can contain account details. */
export const authActionLifetime = { gcTime: 0 };

export function authActionOptions<TInput>(mutationFn: (input: TInput) => Promise<void>) {
  return mutationOptions({ mutationFn, ...authActionLifetime });
}
