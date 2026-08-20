import assert from "node:assert/strict";
import path from "node:path";
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

test("resolves source directories from SwiftPM product memberships", async () => {
  const packageRoot = path.resolve("/tmp", "custom-swift-package");
  const description = {
    path: packageRoot,
    products: [{ name: "WebApp" }, { name: "Worker" }],
    targets: [
      {
        name: "Worker",
        module_type: "SwiftTarget",
        path: "CustomSources/Application",
        product_memberships: ["Worker"],
      },
      {
        name: "Shared",
        module_type: "SwiftTarget",
        path: "Sources/Shared",
        product_memberships: ["WebApp", "Worker"],
      },
      {
        name: "WorkerMacros",
        module_type: "SwiftTarget",
        path: "Macros/WorkerMacros",
        product_memberships: ["Worker"],
      },
      {
        name: "DuplicateSharedPath",
        module_type: "SwiftTarget",
        path: "Sources/Shared",
        product_memberships: ["Worker"],
      },
      {
        name: "WebApp",
        module_type: "SwiftTarget",
        path: "Sources/WebApp",
        product_memberships: ["WebApp"],
      },
      {
        name: "WorkerTests",
        module_type: "SwiftTarget",
        path: "Tests/WorkerTests",
      },
      {
        name: "CDependency",
        module_type: "ClangTarget",
        path: "Sources/CDependency",
        product_memberships: ["Worker"],
      },
    ],
  };
  const { calls, runner } = fakeRunner(JSON.stringify(description));
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    { warn() {} },
  );

  assert.deepEqual(
    await swift.getProductSourceDirectories("Examples/Worker", "Worker"),
    [
      path.join(packageRoot, "CustomSources/Application"),
      path.join(packageRoot, "Sources/Shared"),
      path.join(packageRoot, "Macros/WorkerMacros"),
    ],
  );
  assert.deepEqual(calls, [
    [
      "package",
      "--package-path",
      "Examples/Worker",
      "describe",
      "--type",
      "json",
    ],
  ]);
});

test("omits the default package path when describing product sources", async () => {
  const packageRoot = path.resolve("/tmp", "swift-package");
  const { calls, runner } = fakeRunner(
    JSON.stringify({
      path: packageRoot,
      products: [{ name: "Worker" }],
      targets: [
        {
          module_type: "SwiftTarget",
          path: "Sources/Worker",
          product_memberships: ["Worker"],
        },
      ],
    }),
  );
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    { warn() {} },
  );

  assert.deepEqual(await swift.getProductSourceDirectories(".", "Worker"), [
    path.join(packageRoot, "Sources/Worker"),
  ]);
  assert.deepEqual(calls, [["package", "describe", "--type", "json"]]);
});

test("rejects products missing from the SwiftPM description", async () => {
  const { runner } = fakeRunner(
    JSON.stringify({ path: "/tmp/package", products: [], targets: [] }),
  );
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    { warn() {} },
  );

  await assert.rejects(
    swift.getProductSourceDirectories(".", "Missing"),
    /Product "Missing" was not found/,
  );
});

test("rejects products without matching Swift targets", async () => {
  const { runner } = fakeRunner(
    JSON.stringify({
      path: "/tmp/package",
      products: [{ name: "Worker" }],
      targets: [
        {
          module_type: "ClangTarget",
          path: "Sources/Worker",
          product_memberships: ["Worker"],
        },
      ],
    }),
  );
  const swift = new SwiftToolchain(
    runner as unknown as CommandRunner,
    "swift",
    undefined,
    { warn() {} },
  );

  await assert.rejects(
    swift.getProductSourceDirectories(".", "Worker"),
    /No Swift source targets were found/,
  );
});
