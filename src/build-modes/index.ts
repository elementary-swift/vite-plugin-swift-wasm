import type { BuildMode } from "../virtual-module.ts";
import { createInitBuilder } from "./init.ts";
import { createJSBuilder } from "./js.ts";
import type {
  BuildModeBuilder,
  BuildOptions,
  SwiftBuildCommands,
} from "./types.ts";

export type {
  BuildModeBuilder,
  BuildOptions,
  BuildOutput,
  SwiftBuildCommands,
} from "./types.ts";

export function createBuildModeBuilder(
  mode: BuildMode,
  options: BuildOptions,
  swift: SwiftBuildCommands,
): BuildModeBuilder {
  switch (mode) {
    case "init":
      return createInitBuilder(options, swift);
    case "js":
      return createJSBuilder(options, swift);
  }
}
