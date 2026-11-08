import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from "@playwright/test/reporter";

export default class ErrorsReporter implements Reporter {
  onTestEnd(
    test: Pick<TestCase, "expectedStatus" | "titlePath">,
    result: Pick<TestResult, "status" | "errors" | "attachments">,
  ) {
    if (result.status === "skipped" || result.status === test.expectedStatus) return;
    console.error(`FAIL ${test.titlePath().filter(Boolean).join(" > ")}`);
    for (const error of result.errors) this.onError(error);
    for (const attachment of result.attachments)
      if (attachment.path) console.error(`${attachment.name}: ${attachment.path}`);
  }

  onError(error: TestError) {
    console.error(error.stack ?? error.message ?? error.value);
  }

  onEnd(result: FullResult) {
    console.log(`Tests ${result.status} (${(result.duration / 1000).toFixed(1)}s)`);
  }
}
