interface Invitation {
  id: string;
  email: string;
  attempt: number;
  name: string | null;
  organizationName: string;
}

interface Dependencies {
  claim: () => Promise<Invitation | null>;
  send: (invitation: Invitation) => Promise<void>;
  finish: (invitation: Invitation, sent: boolean) => Promise<void>;
  reportFailure: (message: string) => void;
}

export class SharingMailWorker {
  private running: Promise<void> | undefined;

  constructor(private readonly dependencies: Dependencies) {}

  trigger() {
    this.running ??= this.flush()
      .catch(() =>
        this.dependencies.reportFailure(
          "Sharing invitation delivery is unavailable; pending mail will be retried.",
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
  }

  async idle() {
    await this.running;
  }

  private async flush() {
    for (let i = 0; i < 30; i++) {
      const invitation = await this.dependencies.claim();
      if (!invitation) return;
      let sent = false;
      try {
        await this.dependencies.send(invitation);
        sent = true;
      } catch {
        this.dependencies.reportFailure("Sharing invitation delivery failed; it will be retried.");
      }
      await this.dependencies.finish(invitation, sent);
    }
  }
}
