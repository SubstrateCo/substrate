import ErrorsReporter from "./errors-reporter.js";
import type { TestCase } from "@playwright/test/reporter";
import { expect, test } from "bun:test";

const testCase = {
  expectedStatus: "passed",
  titlePath: () => ["", "functional", "a workflow"],
} satisfies Pick<TestCase, "expectedStatus" | "titlePath">;

function recorded() {
  const output: (string | undefined)[] = [];
  return { output, reporter: new ErrorsReporter({ error: (line) => output.push(line) }) };
}

test("successful and skipped workflows produce no test output", () => {
  const { output, reporter } = recorded();
  for (const status of ["passed", "skipped"] as const)
    reporter.onTestEnd(testCase, { status, errors: [], attachments: [] });
  expect(output).toEqual([]);
});

test("failed workflows retain their identity, error, and artifact path", () => {
  const { output, reporter } = recorded();
  reporter.onTestEnd(testCase, {
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
  expect(output).toEqual([
    "FAIL functional > a workflow",
    "Expected the saved task",
    "error-context: test-results/error-context.md",
  ]);
});
