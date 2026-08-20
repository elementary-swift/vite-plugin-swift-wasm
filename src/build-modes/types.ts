export type BuildOptions = {
  swiftSDK: string;
  packagePath: string;
  scratchPath: string;
  product: string;
  configuration: string;
  toolsetArgs: string[];
  extraBuildArgs: string[];
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
