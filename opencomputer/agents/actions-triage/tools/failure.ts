import type { DataValue } from "@opencomputer/agent";

const MAX_LOG_CHARACTERS = 24_000;
const MAX_TEXT_CHARACTERS = 2_000;

export function redactCredentialShapes(value: string): string {
  return value
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_ACCESS_KEY]")
    .replace(
      /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}={0,2}\b/gi,
      "$1[REDACTED_TOKEN]",
    );
}

export type WorkflowFailure = {
  repository: string;
  workflow: string;
  runId: number;
  runAttempt: number;
  runNumber: number;
  eventName: string;
  headBranch: string;
  headSha: string;
  actor: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  failedLogs: string;
  logsTruncated: boolean;
};

type JsonRecord = Record<string, DataValue>;

function record(value: DataValue | undefined): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringField(value: DataValue | undefined, maximum = MAX_TEXT_CHARACTERS): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function positiveInteger(value: DataValue | undefined, fallback = 1): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

export function parseWorkflowFailure(value: DataValue | undefined): WorkflowFailure | undefined {
  const payload = record(value);
  if (payload.event !== "github.actions.workflow.failed") return undefined;

  const repository = stringField(payload.repository, 300);
  const workflow = stringField(payload.workflow, 300);
  const url = stringField(payload.url, 2_000);
  const runId = positiveInteger(payload.runId, 0);
  if (!repository || !workflow || !runId || !url.startsWith("https://github.com/")) {
    return undefined;
  }

  return {
    repository,
    workflow,
    runId,
    runAttempt: positiveInteger(payload.runAttempt),
    runNumber: positiveInteger(payload.runNumber),
    eventName: stringField(payload.eventName, 100),
    headBranch: stringField(payload.headBranch, 300),
    headSha: stringField(payload.headSha, 64),
    actor: stringField(payload.actor, 300),
    url,
    createdAt: stringField(payload.createdAt, 100),
    updatedAt: stringField(payload.updatedAt, 100),
    failedLogs: redactCredentialShapes(
      stringField(payload.failedLogs, MAX_LOG_CHARACTERS),
    ),
    logsTruncated: payload.logsTruncated === true,
  };
}

export function failureContext(failure: WorkflowFailure): string {
  return JSON.stringify(failure, null, 2);
}
