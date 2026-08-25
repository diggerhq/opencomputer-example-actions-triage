import assert from "node:assert/strict";
import test from "node:test";
import {
  publishTriage,
  slackMessage,
  triageContent,
} from "../opencomputer/agents/actions-triage/tools/publish-triage.js";

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

test("renders a readable Slack message", () => {
  const message = slackMessage({
    title: "acme/widgets CI failed",
    body: "The unit-test job failed.",
    url: "https://github.com/acme/widgets/actions/runs/42",
    likelyCause: "A widget assertion regressed.",
    evidence: ["Expected 2 but received 3"],
    nextSteps: ["Reproduce the widget test locally"],
  });

  assert.match(message, /:red_circle: \*acme\/widgets CI failed\*/);
  assert.match(message, /\*Evidence\*\n• Expected 2 but received 3/);
  assert.match(
    message,
    /<https:\/\/github.com\/acme\/widgets\/actions\/runs\/42\|Open failed GitHub Actions run>/,
  );
});

test("sends triage through the managed Slack connection", async () => {
  const originalFetch = globalThis.fetch;
  const originalChannel = process.env.SLACK_CHANNEL_ID;
  const originalConnectionsUrl = process.env.OPENCOMPUTER_CONNECTIONS_URL;
  const originalConnectionToken = process.env.OPENCOMPUTER_CONNECTION_TOKEN;
  let request: { url: string; init?: RequestInit } | undefined;

  try {
    process.env.SLACK_CHANNEL_ID = "C0123456789";
    process.env.OPENCOMPUTER_CONNECTIONS_URL = "https://connections.test";
    process.env.OPENCOMPUTER_CONNECTION_TOKEN = "runtime-token";
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      request = { url: String(url), init };
      return Response.json({ ok: true, ts: "123.456" });
    }) as typeof fetch;

    const result = await publishTriage.run({
      input: {
        title: "acme/widgets CI failed",
        summary: "The unit-test job failed.",
        likelyCause: "A widget assertion regressed.",
        evidence: ["Expected 2 but received 3"],
        nextSteps: ["Reproduce the widget test locally"],
        runUrl: "https://github.com/acme/widgets/actions/runs/42",
      },
      sessionId: "session-1",
      messageId: "message-1",
      agentId: "actions-triage",
      async reportProgress() {},
    });

    assert.deepEqual(result, { delivered: true });
    assert.equal(request?.url, "https://connections.test/slack-api/fetch");
    const envelope = JSON.parse(String(request?.init?.body)) as {
      method: string;
      path: string;
      body: string;
    };
    assert.equal(envelope.method, "POST");
    assert.equal(envelope.path, "/api/chat.postMessage");
    const body = JSON.parse(envelope.body) as { channel: string; text: string };
    assert.equal(body.channel, "C0123456789");
    assert.match(body.text, /acme\/widgets CI failed/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalChannel === undefined) delete process.env.SLACK_CHANNEL_ID;
    else process.env.SLACK_CHANNEL_ID = originalChannel;
    if (originalConnectionsUrl === undefined) {
      delete process.env.OPENCOMPUTER_CONNECTIONS_URL;
    } else {
      process.env.OPENCOMPUTER_CONNECTIONS_URL = originalConnectionsUrl;
    }
    if (originalConnectionToken === undefined) {
      delete process.env.OPENCOMPUTER_CONNECTION_TOKEN;
    } else {
      process.env.OPENCOMPUTER_CONNECTION_TOKEN = originalConnectionToken;
    }
  }
});
