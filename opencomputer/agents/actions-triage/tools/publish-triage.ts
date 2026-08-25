import {
  bearer,
  defineConnection,
  defineTool,
  useSecret,
} from "@opencomputer/agent";
import { redactCredentialShapes } from "../failure.js";

const slack = defineConnection({
  id: "slack-api",
  origin: "https://slack.com",
  methods: ["POST"],
  pathPrefix: "/api/chat.postMessage",
  headers: {
    Authorization: bearer(useSecret("SLACK_BOT_TOKEN")),
  },
});

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

export type TriageContent = ReturnType<typeof triageContent>;

export function slackMessage(content: TriageContent): string {
  const evidence = content.evidence.map((item) => `• ${item}`).join("\n");
  const nextSteps = content.nextSteps
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `:red_circle: *${content.title}*

${content.body}

*Likely cause*
${content.likelyCause}

*Evidence*
${evidence}

*Next steps*
${nextSteps}

<${content.url}|Open failed GitHub Actions run>`;
}

type SlackResponse = {
  ok?: unknown;
  error?: unknown;
};

export const publishTriage = defineTool({
  name: "send_slack_triage",
  description:
    "Send the completed GitHub Actions failure triage directly to the configured Slack channel. Call exactly once after analyzing the supplied failure evidence.",
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
  async run({ input, signal }) {
    const channel = process.env.SLACK_CHANNEL_ID?.trim();
    if (!channel || !/^[CGD][A-Z0-9]{8,}$/.test(channel)) {
      throw new Error(
        "SLACK_CHANNEL_ID must be configured with a Slack conversation ID",
      );
    }

    const response = await slack.fetch("/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        channel,
        text: slackMessage(triageContent(input)),
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal,
    });

    let result: SlackResponse;
    try {
      result = (await response.json()) as SlackResponse;
    } catch {
      throw new Error(
        `Slack returned an invalid response (HTTP ${response.status})`,
      );
    }
    if (!response.ok || result.ok !== true) {
      const error =
        typeof result.error === "string" ? result.error : "unknown_error";
      throw new Error(`Slack delivery failed: ${error} (HTTP ${response.status})`);
    }

    return {
      delivered: true,
    };
  },
});
