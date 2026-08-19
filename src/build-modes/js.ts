import path from "node:path";
import { moduleImportSpecifier } from "../paths.ts";
import type { VirtualModuleRequest } from "../virtual-module.ts";
import type {
  BuildModeBuilder,
  BuildOptions,
  BuildOutput,
  SwiftBuildCommands,
} from "./types.ts";

type JSModuleOptions = Pick<VirtualModuleRequest, "module">;

export function createJSBuilder(
  options: BuildOptions,
  swift: SwiftBuildCommands,
  moduleOptions: JSModuleOptions = {},
): BuildModeBuilder {
  const outputDirectory = getJSOutputDirectory(options);
  const commandArgs = getJSBuildArgs(options, outputDirectory);

  return {
    commandArgs,
    async prepare() {
      if (!(await swift.hasPlugin(options.packagePath, "js"))) {
        throw new Error(
          `The SwiftPM "js" plugin is not available. Add JavaScriptKit as a dependency to the Swift package: https://github.com/swiftwasm/JavaScriptKit`,
        );
      }
    },
    async build() {
      await swift.run(commandArgs);
      return getJSBuildOutput(outputDirectory, options.product);
    },
    moduleSource(output) {
      return getJSModuleSource(output, moduleOptions);
    },
  };
}

export function getJSModuleSource(
  output: BuildOutput,
  options: JSModuleOptions = {},
): string {
  const entryModule = JSON.stringify(moduleImportSpecifier(output.entryModule));
  if (!options.module) {
    return `export * from ${entryModule};`;
  }

  const wasmModule = JSON.stringify(
    `${moduleImportSpecifier(output.wasmModule)}?module`,
  );
  return `import wasmModule from ${wasmModule};
import { init as packageToJSInit } from ${entryModule};
export * from ${entryModule};
export function init(options = {}) {
  return packageToJSInit({ module: wasmModule, ...options });
}`;
}

export function getJSBuildArgs(
  options: BuildOptions,
  outputDirectory: string,
): string[] {
  return [
    "package",
    "--package-path",
    options.packagePath,
    "--scratch-path",
    options.scratchPath,
    "--swift-sdk",
    options.swiftSDK,
    ...options.toolsetArgs,
    ...options.extraBuildArgs,
    "js",
    "--configuration",
    options.configuration,
    "--product",
    options.product,
    "--output",
    outputDirectory,
    "--no-optimize",
  ];
}

export function getJSOutputDirectory(options: BuildOptions): string {
  return path.resolve(
    options.packagePath,
    options.scratchPath,
    "plugins/PackageToJS/outputs",
    "vite-plugin-swift-wasm",
    options.product,
    options.configuration,
  );
}

export function getJSBuildOutput(
  outputDirectory: string,
  product: string,
): BuildOutput {
  return {
    entryModule: path.join(outputDirectory, "index.js"),
    wasmModule: path.join(outputDirectory, `${product}.wasm`),
  };
}
