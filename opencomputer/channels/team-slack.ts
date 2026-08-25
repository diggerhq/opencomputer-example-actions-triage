import { defineChannel } from "@opencomputer/agent";

export default defineChannel({
  id: "team-slack",
  type: "slack",
  displayName: "Engineering Slack",
  scopes: {
    bot: ["channels:read", "chat:write"],
  },
  destinations: {
    "ci-failures": {
      type: "conversation",
      visibility: "public",
    },
  },
});
