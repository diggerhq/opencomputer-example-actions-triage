import { registerOutbox } from "@opencomputer/agent";
import ciTriage from "../../../outboxes/ci-triage.js";

export default registerOutbox(ciTriage);
