import path from "node:path";
import { fileURLToPath } from "node:url";
import colors from "picocolors";
import type { CommandRunner } from "./command.ts";
import { DEFAULT_PACKAGE_PATH, DEFAULT_SCRATCH_PATH } from "./defaults.ts";

type SwiftLogger = {
  warn(message: string): void;
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
