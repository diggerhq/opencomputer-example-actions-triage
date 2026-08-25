import { defineTool, publishOutbox } from "@opencomputer/agent";
import { redactCredentialShapes } from "../failure.js";

type TriageInput = {
  title?: unknown;
  summary?: unknown;
  likelyCause?: unknown;
  evidence?: unknown;
  nextSteps?: unknown;
  runUrl?: unknown;
};

function requiredText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return redactCredentialShapes(value.trim().slice(0, maximum));
}

function textList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) {
    throw new Error(`${name} must contain between 1 and 6 strings`);
  }
  return value.map((item, index) =>
    requiredText(item, `${name}[${index}]`, 500),
  );
}

export function triageContent(input: TriageInput) {
  const runUrl = requiredText(input.runUrl, "runUrl", 2_000);
  if (!runUrl.startsWith("https://github.com/")) {
    throw new Error("runUrl must be a GitHub URL");
  }

  return {
    title: requiredText(input.title, "title", 200),
    body: requiredText(input.summary, "summary", 1_500),
    url: runUrl,
    likelyCause: requiredText(input.likelyCause, "likelyCause", 1_000),
    evidence: textList(input.evidence, "evidence"),
    nextSteps: textList(input.nextSteps, "nextSteps"),
  };
}

export const publishTriage = defineTool({
  name: "publish_ci_triage",
  description:
    "Publish the completed GitHub Actions failure triage to the configured Slack destination. Call exactly once after analyzing the supplied failure evidence.",
  input: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short workflow failure title" },
      summary: {
        type: "string",
        description: "Concise impact and failure summary",
      },
      likelyCause: {
        type: "string",
        description: "Most likely cause, with uncertainty",
      },
      evidence: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string" },
        description: "Concrete observations from the supplied metadata and logs",
      },
      nextSteps: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "string" },
        description: "Small, actionable investigation or remediation steps",
      },
      runUrl: {
        type: "string",
        description: "GitHub Actions run URL from the payload",
      },
    },
    required: [
      "title",
      "summary",
      "likelyCause",
      "evidence",
      "nextSteps",
      "runUrl",
    ],
    additionalProperties: false,
  },
  async run({ input, sessionId }) {
    const result = await publishOutbox("ci-triage", {
      type: "github.actions.workflow.triaged",
      content: triageContent(input),
      idempotencyKey: `github-actions-triage:${sessionId}`,
    });
    return {
      id: result.id,
      status: result.status,
      duplicate: result.duplicate,
    };
  },
});
