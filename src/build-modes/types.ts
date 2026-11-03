export type BuildOptions = {
  swiftSDK: string;
  packagePath: string;
  scratchPath: string;
  product: string;
  configuration: string;
  toolsetArgs: string[];
  extraBuildArgs: string[];
  js?: JSBuildOptions;
};

export type JSBuildOptions = {
  /**
   * The WASI runtime used by the generated JavaScript (passed as `--wasi-runtime`, requires JavaScriptKit 0.59 or later).
   * The matching npm package (`@bjorn3/browser_wasi_shim` or `uwasi`) must be installed.
   * @default JavaScriptKit's default ("browser-wasi-shim")
   */
  wasiRuntime?: "browser-wasi-shim" | "uwasi";

  /**
   * Additional arguments to pass to the `swift package js` plugin.
   * @default []
   */
  extraArgs?: string[];
};

export type BuildOutput = {
  entryModule: string;
  wasmModule: string;
};

export type SwiftBuildCommands = {
  run(args: string[]): Promise<void>;
  getBuildOutputPath(buildArgs: string[]): Promise<string>;
  hasPlugin(packagePath: string, pluginName: string): Promise<boolean>;
};

export type BuildModeBuilder = {
  commandArgs: string[];
  prepare?(): Promise<void>;
  build(): Promise<BuildOutput>;
  moduleSource(output: BuildOutput): string;
};
