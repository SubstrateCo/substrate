import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class TimingReporter implements Reporter {
  private started = 0;
  private knownFailures = 0;

  onBegin() {
    this.started = performance.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (test.expectedStatus === "failed" && result.status === "failed") this.knownFailures++;
  }

  async onEnd(result: FullResult) {
    const seconds = (performance.now() - this.started) / 1000;
    console.log(
      `E2E execution: ${seconds.toFixed(1)}s (includes auth and fixtures; excludes service startup).`,
    );
    if (this.knownFailures)
      console.warn(
        `Known expected failures: ${this.knownFailures}. These workflows are not fixed.`,
      );
    if (seconds > 30) console.warn("E2E exceeded the 30s target.");
    return { status: result.status };
  }
}
