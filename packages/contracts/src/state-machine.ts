/** An event of a machine: the states it fires from and the state it moves to. */
export interface MachineEvent<From extends string, To extends string> {
  readonly from: readonly From[];
  readonly to: To;
}

export interface Machine<
  S extends string,
  T extends S,
  E extends Record<keyof E, MachineEvent<Exclude<S, T>, S>>,
> {
  readonly states: readonly S[];
  /** States that accept no event. */
  readonly terminal: readonly T[];
  readonly events: E;
  /** The state after the event, or null when the event cannot fire in this state. */
  next(state: S, event: keyof E): S | null;
  /** The states the event fires from, for the compare-and-set condition of a status write. */
  from<K extends keyof E>(event: K): E[K]["from"];
  canFire(state: S, event: keyof E): boolean;
}

/**
 * A finite state machine as an explicit transition table. An event may fire only from the
 * states it lists, and never from a terminal state. The types check this, and so does the
 * definition at runtime.
 */
export function defineMachine<
  const S extends string,
  const T extends S,
  const E extends Record<keyof E, MachineEvent<NoInfer<Exclude<S, T>>, NoInfer<S>>>,
>(definition: { states: readonly S[]; terminal: readonly T[]; events: E }): Machine<S, T, E> {
  const { states, terminal, events } = definition;
  const known = new Set<string>(states);
  const final = new Set<string>(terminal);
  for (const state of terminal)
    if (!known.has(state)) throw new Error(`Unknown terminal state: ${state}`);
  for (const [name, event] of Object.entries<MachineEvent<string, string>>(events)) {
    if (!known.has(event.to)) throw new Error(`Event ${name} moves to an unknown state.`);
    for (const state of event.from)
      if (!known.has(state) || final.has(state))
        throw new Error(`Event ${name} fires from ${state}, which is unknown or terminal.`);
  }
  const canFire = (state: S, event: keyof E) =>
    events[event].from.some((from: string) => from === state);
  return {
    states,
    terminal,
    events,
    next: (state, event) => (canFire(state, event) ? events[event].to : null),
    from: (event) => events[event].from,
    canFire,
  };
}
