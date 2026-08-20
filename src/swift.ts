import path from "node:path";
import { fileURLToPath } from "node:url";
import colors from "picocolors";
import type { CommandRunner } from "./command.ts";
import { DEFAULT_PACKAGE_PATH, DEFAULT_SCRATCH_PATH } from "./defaults.ts";

type SwiftLogger = {
  warn(message: string): void;
};

type SwiftPackageDescription = {
  path?: unknown;
  products?: Array<{
    name?: unknown;
  }>;
  targets?: Array<{
    module_type?: unknown;
    name?: unknown;
    path?: unknown;
    product_memberships?: unknown;
  }>;
};

export class SwiftToolchain {
  private resolvedSDKID: string | undefined;

  constructor(
    private readonly runner: CommandRunner,
    readonly command: string,
    configuredSDKID: string | undefined,
    private readonly logger: SwiftLogger,
  ) {
    this.resolvedSDKID = configuredSDKID;
  }

  async run(args: string[]): Promise<void> {
    await this.runner.run(this.command, args);
  }

  async resolveSDKID(useEmbeddedSwift: boolean): Promise<string> {
    if (this.resolvedSDKID) {
      return this.resolvedSDKID;
    }

    const targetInfo = JSON.parse(
      await this.runner.capture(this.command, ["-print-target-info"]),
    );
    const compilerTag: string | undefined = targetInfo.swiftCompilerTag;
    if (!compilerTag) {
      throw new Error(
        "Could not detect compiler tag for Swift SDK ID. Verify the Swift toolchain version or set the SWIFT_SDK_ID environment variable manually.",
      );
    }

    this.warnIfXcodeToolchainDetected(compilerTag);

    this.resolvedSDKID = `${compilerTag}_wasm`;
    if (useEmbeddedSwift) {
      this.resolvedSDKID += "-embedded";
    }

    return this.resolvedSDKID;
  }

  async getSingleExecutableTarget(
    packagePath: string,
  ): Promise<string | undefined> {
    const output = await this.runner.capture(this.command, [
      "package",
      "show-executables",
      ...getPackagePathArgs(packagePath),
      "--format",
      "json",
    ]);
    const executables = JSON.parse(output).filter(
      (executable: { package?: unknown }) => !executable.package,
    );

    if (executables.length !== 1) {
      return undefined;
    }
    return executables[0].name ?? undefined;
  }

  async getProductSourceDirectories(
    packagePath: string,
    product: string,
  ): Promise<string[]> {
    const output = await this.runner.capture(this.command, [
      "package",
      ...getPackagePathArgs(packagePath),
      "describe",
      "--type",
      "json",
    ]);
    const description = JSON.parse(output) as SwiftPackageDescription;

    if (!description.products?.some(({ name }) => name === product)) {
      throw new Error(
        `Product "${product}" was not found in the Swift package at "${packagePath}".`,
      );
    }

    if (typeof description.path !== "string") {
      throw new Error(
        `Swift package description for "${packagePath}" does not contain a valid package path.`,
      );
    }

    const sourceDirectories = new Set<string>();
    for (const target of description.targets ?? []) {
      if (
        target.module_type !== "SwiftTarget" ||
        !Array.isArray(target.product_memberships) ||
        !target.product_memberships.includes(product)
      ) {
        continue;
      }

      if (typeof target.path !== "string") {
        const targetName =
          typeof target.name === "string" ? target.name : "unknown";
        throw new Error(
          `Swift target "${targetName}" in product "${product}" does not contain a valid source path.`,
        );
      }

      sourceDirectories.add(path.resolve(description.path, target.path));
    }

    if (sourceDirectories.size === 0) {
      throw new Error(
        `No Swift source targets were found for product "${product}" in the package at "${packagePath}".`,
      );
    }

    return [...sourceDirectories];
  }

  async getBuildOutputPath(buildArgs: string[]): Promise<string> {
    return await this.runner.capture(this.command, [
      "build",
      "--show-bin-path",
      ...buildArgs,
    ]);
  }

  async hasPlugin(packagePath: string, pluginName: string): Promise<boolean> {
    const plugins = await this.runner.capture(this.command, [
      "package",
      ...getPackagePathArgs(packagePath),
      "plugin",
      "--list",
    ]);

    return pluginListIncludes(plugins, pluginName);
  }

  private warnIfXcodeToolchainDetected(compilerTag: string): void {
    if (!/^swiftlang-(\d+\.){4,}/.test(compilerTag)) {
      return;
    }

    this.logger.warn(
      colors.yellow(
        `[!] Xcode Swift toolchain detected. Cross-compiling to WebAssembly is likely to fail with Swift version ${compilerTag}. Make sure to use a Swift.org toolchain: https://www.swift.org/install/`,
      ),
    );
  }
}

function getPackagePathArgs(packagePath: string): string[] {
  return packagePath === DEFAULT_PACKAGE_PATH
    ? []
    : ["--package-path", packagePath];
}

export function getSwiftPMPathArgs(
  packagePath: string,
  scratchPath: string,
): string[] {
  const args = getPackagePathArgs(packagePath);
  if (scratchPath !== DEFAULT_SCRATCH_PATH) {
    args.push("--scratch-path", scratchPath);
  }
  return args;
}

function pluginListIncludes(pluginList: string, pluginName: string): boolean {
  const escapedPluginName = pluginName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^\\s*['‘"]${escapedPluginName}['’"]\\s+\\(plugin\\b`,
    "m",
  ).test(pluginList);
}

export function getToolsetBuildArgs(
  isEmbedded: boolean,
  linkEmbeddedUnicodeDataTables: boolean,
): string[] {
  const args: string[] = [];

  if (isEmbedded && linkEmbeddedUnicodeDataTables) {
    args.push(
      "--toolset",
      toolsetPath("../utils/embedded-unicode-toolset.json"),
    );
  }

  args.push("--toolset", toolsetPath("../utils/wasm-reactor-toolset.json"));
  return args;
}

function toolsetPath(toolsetPathRelativeToThisModule: string): string {
  const absolutePath = fileURLToPath(
    new URL(toolsetPathRelativeToThisModule, import.meta.url),
  );
  let relativePath = path.relative(process.cwd(), absolutePath);

  if (!relativePath.startsWith(".") && !path.isAbsolute(relativePath)) {
    relativePath = `.${path.sep}${relativePath}`;
  }

  return relativePath;
}
