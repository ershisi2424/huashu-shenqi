const { createSetupState } = require("../../../lib/setup-state.cjs");

const state = createSetupState({ filePath: process.env.SETUP_STATE_PATH });
const issued = state.issue();
// stdout is consumed by the interactive installer UI; do not log or persist this value elsewhere.
process.stdout.write(`${issued.code}\n`);
