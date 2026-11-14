import { z } from "zod";

export interface BridgeMethod {
  input: z.ZodType;
  output?: z.ZodType;
}
export type BridgeMethods = Record<string, BridgeMethod>;
/** A value the renderer sends through Electron's structured clone. Main parses it with the method's input schema. */
export type IpcValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | IpcValue[]
  | { [key: string]: IpcValue };
type BridgeResult<B extends BridgeMethod> = B extends { output: infer O extends z.ZodType }
  ? z.output<O>
  : void;
type BridgeResults<M extends BridgeMethods> = { [K in keyof M]: BridgeResult<M[K]> }[keyof M];
type MethodAPI<M extends BridgeMethods> = {
  [K in keyof M]: (
    ...args: M[K]["input"] extends z.ZodTuple
      ? z.input<M[K]["input"]>
      : undefined extends z.input<M[K]["input"]>
        ? [input?: z.input<M[K]["input"]>]
        : [input: z.input<M[K]["input"]>]
  ) => Promise<BridgeResult<M[K]>>;
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
  implementation: {
    [K in keyof M]: (
      input: z.output<M[K]["input"]>,
    ) => BridgeResult<M[K]> | Promise<BridgeResult<M[K]>>;
  },
) {
  return async (method: string, value?: IpcValue): Promise<BridgeResults<M>> => {
    // Electron delivers renderer arguments untyped, so the method name is checked here too.
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
    if (!definition.output) return result;
    // SAFETY: definition.output is the output schema for this exact implementation key.
    return definition.output.parse(result) as BridgeResults<M>;
  };
}

export function exposeBridge<M extends BridgeMethods>(
  channel: string,
  methods: M,
  invoke: (channel: string, method: string, value?: IpcValue) => Promise<BridgeResults<M>>,
): BridgeAPI<M> {
  type Call = (...args: IpcValue[]) => Promise<BridgeResults<M>>;
  // SAFETY: the loop below defines every contract method; dotted names form one nested group.
  const api = {} as BridgeAPI<M>;
  const groups = new Map<string, Record<string, Call>>();
  for (const [method, definition] of Object.entries(methods)) {
    const call: Call = (...args) =>
      invoke(channel, method, definition.input instanceof z.ZodTuple ? args : args[0]);
    const parts = method.split(".");
    if (parts.length === 1) Object.defineProperty(api, method, { value: call, enumerable: true });
    else {
      const group = parts[0]!;
      let nested = groups.get(group);
      if (!nested) {
        nested = {};
        groups.set(group, nested);
        Object.defineProperty(api, group, { value: nested, enumerable: true });
      }
      nested[parts[1]!] = call;
    }
  }
  return api;
}
