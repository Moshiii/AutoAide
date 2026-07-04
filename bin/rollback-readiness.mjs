#!/usr/bin/env node

import {
  evaluateRollbackReadiness,
  formatRollbackReadinessReport,
} from "../src/rollback-readiness.mjs";

const result = await evaluateRollbackReadiness();
console.log(formatRollbackReadinessReport(result));
if (!result.ok) {
  process.exitCode = 1;
}
