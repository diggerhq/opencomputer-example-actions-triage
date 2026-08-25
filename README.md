# OpenComputer GitHub Actions triage agent

This example starts a durable OpenComputer agent session whenever a selected
GitHub Actions workflow fails. The agent analyzes the failed-step logs, states
what is observed versus inferred, and sends one triage report directly through
Slack's `chat.postMessage` API.

The example is intentionally diagnostic. It cannot rerun workflows, modify a
repository, or open an issue. Its only external write is one constrained Slack
`chat.postMessage` call.

## How it works

```text
failed GitHub Actions run
  -> workflow_run collector
  -> authenticated OpenComputer webhook
  -> durable actions-triage session
  -> destination-constrained Slack API tool
  -> configured Slack channel
```

The collector sends workflow metadata and at most 24,000 characters of failed
step logs. Logs and all GitHub-provided strings are treated as untrusted
evidence, not instructions. The collector does not check out or execute code
from the failed run. Common GitHub, AWS, and bearer-token shapes are masked
before logs enter the model and before report text is sent to Slack; this is a
backstop, not a substitute for GitHub's own secret masking.

## Prerequisites

- Node.js 22 or newer
- An OpenComputer account
- A Slack workspace where you can install an app
- A GitHub repository with Actions enabled

## 1. Run the agent in Development

```bash
npm install
npm run opencomputer -- login
npm run dev
```

The development command links or creates the OpenComputer project, syncs the
agent, and prints its dashboard URL.

## 2. Configure Slack delivery

Create a Slack app from the included `slack-app-manifest.yml`, install it to the
Development workspace, and invite the bot to the test channel. The manifest
requests only `chat:write`. Copy the **Bot User OAuth Token** and the channel's
ID; use the ID such as `C0123456789`, not `#channel-name`.

Store the token as a destination-constrained OpenComputer managed secret:

```bash
npm run opencomputer -- secrets set SLACK_BOT_TOKEN \
  --agent current \
  --environment development
```

The CLI prompts for the value without putting it in shell history. The agent's
declared connection permits this secret only for `POST` requests to
`https://slack.com/api/chat.postMessage`.

Store the non-secret channel ID as an environment-specific runtime variable:

```bash
npm run opencomputer -- env set SLACK_CHANNEL_ID \
  --agent current \
  --environment development
```

Restart the development watcher after changing the runtime variable so the
agent runtime receives it.

## 3. Create the OpenComputer webhook

Create a Development webhook for this agent:

```bash
npm run opencomputer -- webhooks create github-actions-failures \
  --agent current \
  --environment development
```

The command prints the stable invocation URL and its bearer token once. Store
them as these GitHub Actions repository secrets:

- `OPENCOMPUTER_WEBHOOK_URL`
- `OPENCOMPUTER_WEBHOOK_TOKEN`

Never commit either value. Rotating the OpenComputer webhook token invalidates
the old value immediately, so update the GitHub secret at the same time.

### Smoke-test Slack before GitHub

Invoke the webhook with a synthetic failure before installing the GitHub
workflow. Enter the URL and token when prompted so neither appears in shell
history:

```bash
printf 'OpenComputer webhook URL: '
IFS= read -r OC_WEBHOOK_URL
printf 'OpenComputer webhook token: '
IFS= read -r -s OC_WEBHOOK_TOKEN
echo

curl --request POST "$OC_WEBHOOK_URL" \
  --header "Authorization: Bearer $OC_WEBHOOK_TOKEN" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: manual-smoke-$(date +%s)" \
  --data-binary @test/fixtures/failed-workflow.json

unset OC_WEBHOOK_URL OC_WEBHOOK_TOKEN
```

Expect HTTP 202, a new durable session, and one message in the configured Slack
channel. Use a new idempotency key for each intentional smoke test.

## 4. Choose workflows to monitor

The included
`.github/workflows/triage-failed-actions.yml` monitors a workflow whose display
name is `CI`:

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
```

Change the list to the exact display names used by the workflows you want to
monitor. Copy the collector workflow and the two repository secrets into each
additional repository that should use the same triage agent.

The collector requests only `actions: read` and `contents: read`. A
`workflow_run` workflow can access secrets even when the triggering workflow
cannot, so do not add checkout or execution of artifacts from the failed run.

## 5. Test end to end

The included `CI` workflow has a manual `force_failure` input:

1. Push the example to a GitHub repository's default branch. GitHub only
   recognizes the `workflow_run` collector after it exists there.
2. Open **Actions → CI → Run workflow**.
3. Set `force_failure` to `true` and run it.
4. Confirm **Triage failed GitHub Actions** receives HTTP 202 from the webhook.
5. Inspect the durable session and managed-egress logs in OpenComputer.
6. Confirm Slack receives one report with the run link, evidence, likely cause,
   and next steps.

Re-delivering the same failed run attempt reuses the webhook idempotency key,
so OpenComputer reuses its durable session. A GitHub rerun has a new attempt
number and produces a new triage report.

## Develop and verify

```bash
npm test
npm run build
```

`npm run dev` compiles the agent and its destination-constrained Slack
connection.

## Current limits

- The agent sees the failed-step log excerpt supplied by `gh run view
  --log-failed`; it does not inspect artifacts, repository contents, or prior
  runs.
- Logs are capped at 24,000 characters. The Slack report says when evidence is
  missing or truncated and links to the complete GitHub run.
- Slack delivery is synchronous and best effort. There is no durable delivery
  queue, independent retry, outbox inspection, or provider-level idempotency.
  If Slack accepts a message but the response is lost, manually retrying the
  tool could create a duplicate.
- The tool sends only to the configured `SLACK_CHANNEL_ID`. It does not map
  GitHub users to Slack users or send direct messages.
- Fork pull-request failures may expose less log context depending on the
  repository's GitHub Actions policy.

## License

MIT
