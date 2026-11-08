import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class TimingReporter implements Reporter {
  private started = 0;
  private knownFailures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private exceeded = false;

  onBegin() {
    this.started = performance.now();
    this.timer = setTimeout(() => {
      this.exceeded = true;
      console.error("E2E exceeded the 60s execution budget; stopping the run.");
      // Use the runner's normal interrupt path so fixtures and servers are cleaned up.
      process.emit("SIGINT");
    }, 60_000);
    this.timer.unref();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.expectedStatus === "failed" && result.status === "failed") this.knownFailures++;
  }

  async onEnd(result: FullResult) {
    clearTimeout(this.timer);
    const seconds = (performance.now() - this.started) / 1000;
    console.log(
      `E2E execution: ${seconds.toFixed(1)}s (includes auth and fixtures; excludes service startup).`,
    );
    if (this.knownFailures)
      console.warn(
        `Known expected failures: ${this.knownFailures}. These workflows are not fixed.`,
      );
    if (seconds > 30) console.warn("E2E exceeded the 30s target.");
    if (this.exceeded || seconds > 60) {
      console.error("E2E exceeded the 60s execution budget.");
      return { status: "failed" as const };
    }
    return { status: result.status };
  }
}
