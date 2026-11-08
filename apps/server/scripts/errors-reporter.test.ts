import ErrorsReporter from "./errors-reporter.js";
import type { TestCase } from "@playwright/test/reporter";
import { afterEach, expect, mock, spyOn, test } from "bun:test";

afterEach(() => {
  mock.restore();
});

const testCase = {
  expectedStatus: "passed",
  titlePath: () => ["", "functional", "a workflow"],
} satisfies Pick<TestCase, "expectedStatus" | "titlePath">;

test("successful and skipped workflows produce no test output", () => {
  const output = spyOn(console, "error").mockImplementation(() => {});
  const reporter = new ErrorsReporter();
  for (const status of ["passed", "skipped"] as const)
    reporter.onTestEnd(testCase, { status, errors: [], attachments: [] });
  expect(output.mock.calls).toEqual([]);
});

test("failed workflows retain their identity, error, and artifact path", () => {
  const output = spyOn(console, "error").mockImplementation(() => {});
  new ErrorsReporter().onTestEnd(testCase, {
    status: "failed",
    errors: [{ message: "Expected the saved task" }],
    attachments: [
      {
        name: "error-context",
        path: "test-results/error-context.md",
        contentType: "text/markdown",
      },
    ],
  });
  expect(output.mock.calls).toEqual([
    ["FAIL functional > a workflow"],
    ["Expected the saved task"],
    ["error-context: test-results/error-context.md"],
  ]);
});
