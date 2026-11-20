import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";

type Writer = (line: string | undefined) => void;

export default class ErrorsReporter implements Reporter {
  private readonly error: Writer;
  private readonly log: Writer;

  // Playwright passes its reporter options here; the writers default to the console.
  constructor({ error = console.error, log = console.log }: { error?: Writer; log?: Writer } = {}) {
    this.error = error;
    this.log = log;
  }

  onTestEnd(
    test: Pick<TestCase, "expectedStatus" | "titlePath">,
    result: Pick<TestResult, "status" | "errors" | "attachments">,
  ) {
    if (result.status === "skipped" || result.status === test.expectedStatus) return;
    this.error(`FAIL ${test.titlePath().filter(Boolean).join(" > ")}`);
    for (const error of result.errors) this.onError(error);
    for (const attachment of result.attachments)
      if (attachment.path) this.error(`${attachment.name}: ${attachment.path}`);
  }

  onError(error: TestError) {
    this.error(error.stack ?? error.message ?? error.value);
  }

  onEnd(result: FullResult) {
    this.log(`Tests ${result.status} (${(result.duration / 1000).toFixed(1)}s)`);
  }
}
