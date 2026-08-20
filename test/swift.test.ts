import assert from "node:assert/strict";
import test from "node:test";
import type { CommandRunner } from "../src/command.ts";
import { SwiftToolchain } from "../src/swift.ts";

function fakeRunner(output: string) {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      async run() {},
      async capture(_command: string, args: string[]) {
        calls.push(args);
        return output;
      },
    },
  };
}

test("omits the default package path from metadata commands", async () => {
  const { calls, runner } = fakeRunner(JSON.stringify([{ name: "Worker" }]));
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    {
      warn() {},
    },
  );

  assert.equal(await swift.getSingleExecutableTarget("."), "Worker");
  assert.deepEqual(calls, [
    ["package", "show-executables", "--format", "json"],
  ]);
});

test("retains an explicitly configured package path for metadata commands", async () => {
  const { calls, runner } = fakeRunner(
    `"js" (plugin, provides the js command)`,
  );
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    {
      warn() {},
    },
  );

  assert.equal(await swift.hasPlugin("Examples/Hello", "js"), true);
  assert.deepEqual(calls, [
    ["package", "--package-path", "Examples/Hello", "plugin", "--list"],
  ]);
});
