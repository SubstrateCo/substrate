import type { RealtimeHint } from "@substrate/contracts/realtime";

export interface Committed<T> {
  result: T;
  hints: RealtimeHint[];
  mail?: "sharing"[];
}

export class RepositoryEffects {
  private readonly hints = new Map<string, RealtimeHint>();
  private readonly mailKinds = new Set<"sharing">();

  hint(hint: RealtimeHint) {
    this.hints.set(JSON.stringify(hint), hint);
  }

  mail(kind: "sharing") {
    this.mailKinds.add(kind);
  }

  merge(effects: RepositoryEffects) {
    for (const hint of effects.hints.values()) this.hint(hint);
    for (const kind of effects.mailKinds) this.mail(kind);
  }

  committed<T>(result: T): Committed<T> {
    const committed: Committed<T> = {
      result,
      hints: [...this.hints.values()],
    };
    if (this.mailKinds.size) committed.mail = [...this.mailKinds];
    return committed;
  }
}
