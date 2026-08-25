import { defineOutbox } from "@opencomputer/agent";
import teamSlack from "../channels/team-slack.js";

export default defineOutbox({
  id: "ci-triage",
  delivery: {
    channel: teamSlack,
    destination: "ci-failures",
  },
});
