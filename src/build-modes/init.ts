import path from "node:path";
import { moduleImportSpecifier } from "../paths.ts";
import type {
  BuildModeBuilder,
  BuildModeDependencies,
  BuildOptions,
  BuildOutput,
} from "./types.ts";

export function createInitBuilder(
  options: BuildOptions,
  dependencies: BuildModeDependencies,
): BuildModeBuilder {
  const buildArgs = getInitBuildArgs(options);
  let output: BuildOutput | undefined;

  return {
    commandArgs: ["build", ...buildArgs],
    async build() {
      await dependencies.swift.run(["build", ...buildArgs]);
      if (output) {
        return output;
      }

      const buildOutputPath =
        await dependencies.swift.getBuildOutputPath(buildArgs);
      const wasmModule = path.resolve(
        buildOutputPath,
        `${options.product}.wasm`,
      );

      output = {
        entryModule: wasmModule,
        wasmModule,
      };
      return output;
    },
    moduleSource(output) {
      const wasmImport = `${moduleImportSpecifier(output.wasmModule)}?init`;
      return `export { default } from ${JSON.stringify(wasmImport)};`;
    },
  };
}

export function getInitBuildArgs(options: BuildOptions): string[] {
  return [
    "--package-path",
    options.packagePath,
    "--swift-sdk",
    options.swiftSDK,
    "--configuration",
    options.configuration,
    "--product",
    options.product,
    ...options.toolsetArgs,
    ...options.extraBuildArgs,
  ];
}
