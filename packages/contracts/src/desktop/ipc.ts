/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns, deslop/no-unsafe-dictionary-type -- This generic IPC boundary parses wire values using each method's contract; the dynamic preload object is typed only after construction. */
import { z } from "zod";

export interface BridgeMethod {
  input: z.ZodType;
  output?: z.ZodType;
}
export type BridgeMethods = Record<string, BridgeMethod>;
type MethodAPI<M extends BridgeMethods> = {
  [K in keyof M]: (
    ...args: M[K]["input"] extends z.ZodTuple
      ? z.input<M[K]["input"]>
      : undefined extends z.input<M[K]["input"]>
        ? [input?: z.input<M[K]["input"]>]
        : [input: z.input<M[K]["input"]>]
  ) => Promise<M[K] extends { output: infer O extends z.ZodType } ? z.output<O> : void>;
};
type Group<K> = K extends `${infer G}.${string}` ? G : never;
export type BridgeAPI<M extends BridgeMethods> = Pick<
  MethodAPI<M>,
  Exclude<keyof M, `${string}.${string}`>
> & {
  [G in Group<keyof M>]: {
    [K in keyof M as K extends `${G}.${infer Name}` ? Name : never]: MethodAPI<M>[K];
  };
};

/** Output typing for values already checked by the domain boundary. */
export const bridgeOutput = <T>() => z.custom<T>();

/** Parse before looking up an implementation, including unknown method names. */
export function handleBridge<M extends BridgeMethods>(
  _channel: string,
  methods: M,
  implementation: { [K in keyof M]: (input: z.output<M[K]["input"]>) => unknown },
) {
  return async (method: unknown, value?: unknown): Promise<unknown> => {
    const name = z.string().safeParse(method);
    if (!name.success || !Object.hasOwn(methods, name.data))
      throw new Error("Invalid bridge operation.");
    // SAFETY: own-key membership was checked against this method table.
    const key = name.data as keyof M;
    const definition = methods[key]!;
    // SAFETY: definition is the input schema for this exact implementation key.
    const result = await implementation[key](
      definition.input.parse(value) as z.output<M[keyof M]["input"]>,
    );
    return definition.output ? definition.output.parse(result) : result;
  };
}

export function exposeBridge<M extends BridgeMethods>(
  channel: string,
  methods: M,
  invoke: (channel: string, method: string, value?: unknown) => Promise<unknown>,
): BridgeAPI<M> {
  const api: Record<string, unknown> = {};
  for (const [method, definition] of Object.entries(methods)) {
    const call = (...args: unknown[]) =>
      invoke(channel, method, definition.input instanceof z.ZodTuple ? args : args[0]);
    const parts = method.split(".");
    if (parts.length === 1) api[method] = call;
    else {
      const group = parts[0]!;
      const name = parts[1]!;
      // SAFETY: dotted methods share a nested object created in this loop.
      const nested = (api[group] ??= {}) as Record<string, unknown>;
      nested[name] = call;
    }
  }
  // SAFETY: every generated function forwards the contract's method and input to main; dotted names form one nested group.
  return api as BridgeAPI<M>;
}
