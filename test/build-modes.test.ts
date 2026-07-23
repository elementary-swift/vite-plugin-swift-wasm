import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  createInitBuilder,
  getInitBuildArgs,
} from "../src/build-modes/init.ts";
import {
  createJSBuilder,
  getJSBuildArgs,
  getJSBuildOutput,
} from "../src/build-modes/js.ts";
import type { SwiftBuildCommands } from "../src/build-modes/types.ts";
import { moduleImportSpecifier } from "../src/paths.ts";

const buildOptions = {
  swiftSDK: "swift-6.2.0-RELEASE_wasm",
  packagePath: "Examples/Hello",
  product: "Hello",
  configuration: "release",
  toolsetArgs: ["--toolset", "./unicode-toolset.json"],
  extraBuildArgs: ["-Xswiftc", "-Ounchecked"],
};

function fakeSwift(outputPath = "/tmp/swift-build") {
  const calls: string[][] = [];
  const outputPathCalls: string[][] = [];
  const swift: SwiftBuildCommands = {
    async run(args) {
      calls.push(args);
    },
    async getBuildOutputPath(args) {
      outputPathCalls.push(args);
      return outputPath;
    },
  };
  return { calls, outputPathCalls, swift };
}

test("init strategy owns its command, output, and module source", async () => {
  assert.deepEqual(getInitBuildArgs(buildOptions), [
    "--package-path",
    "Examples/Hello",
    "--swift-sdk",
    "swift-6.2.0-RELEASE_wasm",
    "--configuration",
    "release",
    "--product",
    "Hello",
    "--toolset",
    "./unicode-toolset.json",
    "-Xswiftc",
    "-Ounchecked",
  ]);

  const { calls, outputPathCalls, swift } = fakeSwift();
  const builder = createInitBuilder(buildOptions, { swift });
  const output = await builder.build();
  const rebuiltOutput = await builder.build();

  assert.deepEqual(calls, [
    ["build", ...getInitBuildArgs(buildOptions)],
    ["build", ...getInitBuildArgs(buildOptions)],
  ]);
  assert.deepEqual(outputPathCalls, [getInitBuildArgs(buildOptions)]);
  assert.deepEqual(output, {
    entryModule: "/tmp/swift-build/Hello.wasm",
    wasmModule: "/tmp/swift-build/Hello.wasm",
  });
  assert.equal(rebuiltOutput, output);
  assert.match(builder.moduleSource(output), /export \{ default \}/);
  assert.match(builder.moduleSource(output), /Hello\.wasm\?init/);
});

test("js strategy owns PackageToJS arguments and generated artifacts", async () => {
  const outputDirectory = "/tmp/package-to-js";
  assert.deepEqual(getJSBuildArgs(buildOptions, outputDirectory), [
    "package",
    "--package-path",
    "Examples/Hello",
    "--swift-sdk",
    "swift-6.2.0-RELEASE_wasm",
    "--toolset",
    "./unicode-toolset.json",
    "-Xswiftc",
    "-Ounchecked",
    "js",
    "--configuration",
    "release",
    "--product",
    "Hello",
    "--output",
    outputDirectory,
    "--no-optimize",
  ]);
  assert.deepEqual(getJSBuildOutput(outputDirectory, "Hello"), {
    entryModule: path.join(outputDirectory, "index.js"),
    wasmModule: path.join(outputDirectory, "Hello.wasm"),
  });

  const { calls, swift } = fakeSwift();
  const builder = createJSBuilder(
    {
      ...buildOptions,
      packagePath: "/tmp/package",
    },
    { swift },
  );
  const output = await builder.build();

  assert.deepEqual(calls, [builder.commandArgs]);
  assert.equal(output.entryModule.endsWith("/index.js"), true);
  assert.equal(output.wasmModule.endsWith("/Hello.wasm"), true);
  assert.match(builder.moduleSource(output), /^export \* from /);
});

test("creates portable Vite import specifiers", () => {
  assert.equal(
    moduleImportSpecifier(path.join(process.cwd(), ".build", "index.js")),
    "./.build/index.js",
  );
});
