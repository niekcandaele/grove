/**
 * E2E test helpers - re-exports all helpers from a single entry point.
 */

export {
  setupTestEnvironment,
  type TestEnvironment,
  type TestEnvOptions,
} from "./test-env.js";

export {
  GroveRunner,
  createGroveRunner,
  getBinaryPath,
  type RunResult,
  type GroveRunnerOptions,
} from "./grove-runner.js";

export {
  assertions,
  assertExitCode,
  assertOutputContains,
  assertOutputNotContains,
  assertFileExists,
  assertFileNotExists,
  assertDirExists,
  assertDirNotExists,
  assertFileContains,
  assertFileNotContains,
  assertEnvFileHasVar,
  getEnvVar,
} from "./assertions.js";
