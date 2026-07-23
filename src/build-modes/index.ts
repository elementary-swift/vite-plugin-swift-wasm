import type { BuildMode } from "../virtual-module.ts";
import { createInitBuilder } from "./init.ts";
import { createJSBuilder } from "./js.ts";
import type {
  BuildModeBuilder,
  BuildModeDependencies,
  BuildOptions,
} from "./types.ts";

export type {
  BuildModeBuilder,
  BuildModeDependencies,
  BuildOptions,
  BuildOutput,
} from "./types.ts";

export function createBuildModeBuilder(
  mode: BuildMode,
  options: BuildOptions,
  dependencies: BuildModeDependencies,
): BuildModeBuilder {
  switch (mode) {
    case "init":
      return createInitBuilder(options, dependencies);
    case "js":
      return createJSBuilder(options, dependencies);
  }
}
