import assert from "node:assert/strict";
import test from "node:test";
import { triageContent } from "../opencomputer/agents/actions-triage/tools/publish-triage.js";

test("builds provider-neutral Slack content", () => {
  assert.deepEqual(
    triageContent({
      title: "acme/widgets CI failed",
      summary: "The unit-test job failed.",
      likelyCause: "A widget assertion regressed.",
      evidence: ["widget.test.ts expected 2 but received 3"],
      nextSteps: ["Reproduce the widget unit test locally"],
      runUrl: "https://github.com/acme/widgets/actions/runs/42",
    }),
    {
      title: "acme/widgets CI failed",
      body: "The unit-test job failed.",
      url: "https://github.com/acme/widgets/actions/runs/42",
      likelyCause: "A widget assertion regressed.",
      evidence: ["widget.test.ts expected 2 but received 3"],
      nextSteps: ["Reproduce the widget unit test locally"],
    },
  );
});
test("rejects non-GitHub links and empty evidence", () => {
  assert.throws(
    () =>
      triageContent({
        title: "CI failed",
        summary: "Failure",
        likelyCause: "Unknown",
        evidence: [],
        nextSteps: ["Inspect the run"],
        runUrl: "https://example.com/run/42",
      }),
    /runUrl must be a GitHub URL|evidence must contain/,
  );
});
