import path from "node:path";
import { moduleImportSpecifier } from "../paths.ts";
import type {
  BuildModeBuilder,
  BuildOptions,
  BuildOutput,
  SwiftBuildCommands,
} from "./types.ts";

export function createJSBuilder(
  options: BuildOptions,
  swift: SwiftBuildCommands,
): BuildModeBuilder {
  const outputDirectory = getJSOutputDirectory(options);
  const commandArgs = getJSBuildArgs(options, outputDirectory);

  return {
    commandArgs,
    async prepare() {
      try {
        await swift.ensurePlugin(options.packagePath, "js");
      } catch {
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
      return `export * from ${JSON.stringify(
        moduleImportSpecifier(output.entryModule),
      )};`;
    },
  };
}

export function getJSBuildArgs(
  options: BuildOptions,
  outputDirectory: string,
): string[] {
  return [
    "package",
    "--package-path",
    options.packagePath,
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
    ".build/plugins/PackageToJS/outputs",
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
