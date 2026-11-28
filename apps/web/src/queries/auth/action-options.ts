import { mutationOptions } from "@tanstack/react-query";

export const authActionLifetime = { gcTime: 0 };

export function authActionOptions<TInput>(mutationFn: (input: TInput) => Promise<void>) {
  return mutationOptions({ mutationFn, ...authActionLifetime });
}
