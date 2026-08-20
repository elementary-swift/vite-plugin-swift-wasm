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
  getJSModuleSource,
} from "../src/build-modes/js.ts";
import { createBuildModeBuilder } from "../src/build-modes/index.ts";
import type { SwiftBuildCommands } from "../src/build-modes/types.ts";
import { moduleImportSpecifier } from "../src/paths.ts";

const buildOptions = {
  swiftSDK: "swift-6.2.0-RELEASE_wasm",
  packagePath: "Examples/Hello",
  scratchPath: ".build",
  product: "Hello",
  configuration: "release",
  toolsetArgs: ["--toolset", "./unicode-toolset.json"],
  extraBuildArgs: ["-Xswiftc", "-Ounchecked"],
};
const defaultBuildOptions = {
  ...buildOptions,
  packagePath: ".",
  scratchPath: ".build",
};

function fakeSwift(outputPath = "/tmp/swift-build", hasJSPlugin = true) {
  const calls: string[][] = [];
  const outputPathCalls: string[][] = [];
  const jsPluginChecks: string[] = [];
  const swift: SwiftBuildCommands = {
    async run(args) {
      calls.push(args);
    },
    async getBuildOutputPath(args) {
      outputPathCalls.push(args);
      return outputPath;
    },
    async hasPlugin(packagePath, pluginName) {
      assert.equal(pluginName, "js");
      jsPluginChecks.push(packagePath);
      return hasJSPlugin;
    },
  };
  return { calls, outputPathCalls, jsPluginChecks, swift };
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
  const builder = createInitBuilder(buildOptions, swift);
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

test("omits default SwiftPM package and scratch paths", () => {
  assert.deepEqual(getInitBuildArgs(defaultBuildOptions), [
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

  assert.deepEqual(getJSBuildArgs(defaultBuildOptions, "/tmp/package-to-js"), [
    "package",
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
    "/tmp/package-to-js",
    "--no-optimize",
  ]);
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

  const { calls, jsPluginChecks, swift } = fakeSwift();
  const builder = createJSBuilder(
    {
      ...buildOptions,
      packagePath: "/tmp/package",
    },
    swift,
  );
  await builder.prepare?.();
  const output = await builder.build();

  assert.deepEqual(calls, [builder.commandArgs]);
  assert.deepEqual(jsPluginChecks, ["/tmp/package"]);
  assert.equal(output.entryModule.endsWith("/index.js"), true);
  assert.equal(output.wasmModule.endsWith("/Hello.wasm"), true);
  assert.match(builder.moduleSource(output), /^export \* from /);
});

test("js strategy places output beneath the SwiftPM scratch path", () => {
  const builder = createJSBuilder(
    {
      ...buildOptions,
      packagePath: "/tmp/package",
      scratchPath: ".build/worker",
    },
    fakeSwift().swift,
  );

  assert.equal(
    builder.commandArgs.at(builder.commandArgs.indexOf("--output") + 1),
    "/tmp/package/.build/worker/plugins/PackageToJS/outputs/vite-plugin-swift-wasm/Hello/release",
  );
  assert.deepEqual(builder.commandArgs.slice(0, 5), [
    "package",
    "--package-path",
    "/tmp/package",
    "--scratch-path",
    ".build/worker",
  ]);
});

test("js strategy explains how to install a missing plugin", async () => {
  const { swift } = fakeSwift("/tmp/swift-build", false);
  const builder = createJSBuilder(buildOptions, swift);
  if (!builder.prepare) {
    throw new Error("js builder must provide a prepare hook");
  }

  await assert.rejects(
    builder.prepare(),
    /Add JavaScriptKit as a dependency.*github\.com\/swiftwasm\/JavaScriptKit/,
  );
});

test("js source keeps its existing re-export behavior by default", () => {
  const output = {
    entryModule: path.join(process.cwd(), ".build/package-to-js/index.js"),
    wasmModule: path.join(process.cwd(), ".build/package-to-js/Hello.wasm"),
  };

  assert.equal(
    getJSModuleSource(output),
    'export * from "./.build/package-to-js/index.js";',
  );
});

test("js module source imports Wasm and wraps only init", () => {
  const output = {
    entryModule: path.join(process.cwd(), ".build/package-to-js/index.js"),
    wasmModule: path.join(process.cwd(), ".build/package-to-js/Worker.wasm"),
  };

  assert.equal(
    getJSModuleSource(output, { module: true }),
    `import wasmModule from "./.build/package-to-js/Worker.wasm?module";
import { init as packageToJSInit } from "./.build/package-to-js/index.js";
export * from "./.build/package-to-js/index.js";
export function init(options = {}) {
  return packageToJSInit({ module: wasmModule, ...options });
}`,
  );
});

test("build mode factory validates request flags", () => {
  const { swift } = fakeSwift();

  assert.throws(
    () =>
      createBuildModeBuilder(
        { mode: "init", module: true },
        buildOptions,
        swift,
      ),
    /"module" query parameter is only supported with the "js" build mode/,
  );

  const builder = createBuildModeBuilder(
    { mode: "js", module: true },
    buildOptions,
    swift,
  );
  assert.match(
    builder.moduleSource({
      entryModule: path.join(process.cwd(), ".build/package-to-js/index.js"),
      wasmModule: path.join(process.cwd(), ".build/package-to-js/Worker.wasm"),
    }),
    /Worker\.wasm\?module/,
  );
});

test("creates portable Vite import specifiers", () => {
  assert.equal(
    moduleImportSpecifier(path.join(process.cwd(), ".build", "index.js")),
    "./.build/index.js",
  );
});
