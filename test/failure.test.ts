import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkflowFailure,
  redactCredentialShapes,
} from "../opencomputer/agents/actions-triage/tools/failure.js";

test("parses a valid failed workflow payload", () => {
  const failure = parseWorkflowFailure({
    event: "github.actions.workflow.failed",
    repository: "acme/widgets",
    workflow: "CI",
    runId: 42,
    runAttempt: 2,
    runNumber: 10,
    eventName: "pull_request",
    headBranch: "feature/widget",
    headSha: "abc123",
    actor: "octocat",
    url: "https://github.com/acme/widgets/actions/runs/42",
    createdAt: "2026-08-24T12:00:00Z",
    updatedAt: "2026-08-24T12:03:00Z",
    failedLogs: "FAIL test/widget.test.ts",
    logsTruncated: false,
  });

  assert.equal(failure?.runId, 42);
  assert.equal(failure?.runAttempt, 2);
  assert.equal(failure?.failedLogs, "FAIL test/widget.test.ts");
});

test("rejects an unrelated or incomplete payload", () => {
  assert.equal(parseWorkflowFailure({ event: "push" }), undefined);
  assert.equal(
    parseWorkflowFailure({
      event: "github.actions.workflow.failed",
      repository: "acme/widgets",
      workflow: "CI",
      runId: 42,
      url: "https://example.com/not-github",
    }),
    undefined,
  );
});

test("caps untrusted log text", () => {
  const failure = parseWorkflowFailure({
    event: "github.actions.workflow.failed",
    repository: "acme/widgets",
    workflow: "CI",
    runId: 42,
    url: "https://github.com/acme/widgets/actions/runs/42",
    failedLogs: "x".repeat(30_000),
  });

  assert.equal(failure?.failedLogs.length, 24_000);
});

test("redacts common credential shapes before model or Slack use", () => {
  assert.equal(
    redactCredentialShapes(
      "token github_pat_abcdefghijklmnopqrstuvwxyz123456 and Bearer abcdefghijklmnopqrstuvwxyz.123456",
    ),
    "token [REDACTED_GITHUB_TOKEN] and Bearer [REDACTED_TOKEN]",
  );
});
