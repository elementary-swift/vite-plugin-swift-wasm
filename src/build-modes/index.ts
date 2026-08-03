import type { VirtualModuleRequest } from "../virtual-module.ts";
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
  request: VirtualModuleRequest,
  options: BuildOptions,
  swift: SwiftBuildCommands,
): BuildModeBuilder {
  switch (request.mode) {
    case "init":
      if (request.module) {
        throw new Error(
          `The "module" query parameter is only supported with the "js" build mode.`,
        );
      }
      return createInitBuilder(options, swift);
    case "js":
      return createJSBuilder(options, swift, request);
  }
}
