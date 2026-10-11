import PipelineEngine from "../pipeline/pipeline-engine.js";
import assert from "node:assert/strict";
import type { Workflow } from "../workflow/workflow.js";
import { workflow } from "./pipeline-run.test.js";

const engine = new PipelineEngine(workflow);

const run1 = await engine.run();
const run2 = await engine.run();

assert.equal(run1.status, "RUNNING");
assert.equal(run2.status, "RUNNING");

assert.equal(run1.pipelineId, run2.pipelineId);

assert.notEqual(run1.id, run2.id);
assert.strictEqual(run1, engine.getRun(run1.id));

assert.equal(engine.getRun("invalid-id"), undefined);

console.log("All PipelineEngine tests passed!");
