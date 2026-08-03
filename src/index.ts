import path from "node:path";
import colors from "picocolors";
import { createLogger, type Plugin } from "vite";
import {
  createBuildModeBuilder,
  type BuildOptions,
  type BuildOutput,
} from "./build-modes/index.ts";
import { CommandRunner, quoteArgsForDisplay } from "./command.ts";
import { moduleImportSpecifier } from "./paths.ts";
import { createReloadDebouncer, createThrottledRebuilder } from "./rebuild.ts";
import { getToolsetBuildArgs, SwiftToolchain } from "./swift.ts";
import {
  parseResolvedSwiftWasmVirtualModule,
  resolveSwiftWasmVirtualModule,
  virtualModuleProductExample,
  type VirtualModuleRequest,
} from "./virtual-module.ts";
import { WasmOptimizer } from "./wasm-opt.ts";

const DEFAULT_WASM_OPT_ARGS = ["-Os", "--strip-debug"];

type SwiftWasmPluginOptions = {
  /**
   * The path to the Swift package.
   * @default "."
   */
  packagePath?: string;
  /**
   * Additional arguments to pass to the Swift compiler.
   * @default []
   */
  extraBuildArgs?: string[];

  /**
   * Whether to use Embedded Swift variant of the WebAssembly Swift SDK (in production builds only).
   * Embedded Swift is a subset of Swift designed for constrained environments,
   * producing smaller binaries with reduced runtime overhead.
   *
   * This option simply adds "-embedded" to the determined Swift SDK ID.
   * If the SWIFT_SDK_ID environment variable is set, this option is ignored.
   *
   * @default false
   */
  useEmbeddedSDK?: boolean;

  /**
   * Whether to link the Unicode data tables when building with Embedded Swift.
   *
   * This is only relevant when useEmbeddedSDK is true.
   * By explicitly setting this to false, you can disable the automatic linking of the Unicode data tables.
   * See https://docs.swift.org/embedded/documentation/embedded/strings/ for more details.
   *
   * @default true
   */
  linkEmbeddedUnicodeDataTables?: boolean;

  /**
   * Whether to optimize the generated WebAssembly module using wasm-opt (in production builds only).
   * When enabled, applies size and performance optimizations to the final .wasm file.
   * @default true
   */
  useWasmOpt?: boolean;

  /**
   * Arguments to pass to wasm-opt.
   * @default ["-Os", "--strip-debug"]
   */
  wasmOptArgs?: string[];
};

export default function swiftWasm(
  options: SwiftWasmPluginOptions = {},
): Plugin {
  const packagePath = options.packagePath ?? ".";
  const runner = new CommandRunner();
  const swift = new SwiftToolchain(
    runner,
    process.env.SWIFT_BIN ?? "swift",
    process.env.SWIFT_SDK_ID,
    logger,
  );
  const wasmOptimizer = new WasmOptimizer(
    runner,
    process.env.WASM_OPT_BIN ?? "wasm-opt",
    options.wasmOptArgs ?? DEFAULT_WASM_OPT_ARGS,
    logger,
  );

  let useWasmOpt = options.useWasmOpt ?? true;
  let useEmbeddedSwift = options.useEmbeddedSDK ?? false;
  let isDev = false;

  // Only one imported Swift module is supported for now.
  let watchedSourcesFolders: string[] = [];
  let rebuild: (() => Promise<void>) | undefined;

  const reloadDebouncer = createReloadDebouncer(20);

  return {
    name: "swift-wasm-plugin",
    enforce: "pre",

    async config(_, { command }) {
      isDev = command === "serve";

      if (isDev) {
        useWasmOpt = false;
        useEmbeddedSwift = false;
      }

      if (useWasmOpt && !(await wasmOptimizer.isAvailable())) {
        logger.warn(
          colors.red(
            `[!] wasm-opt is not available, disabling optimization...`,
          ),
        );
        logger.warn(
          "Please make sure binaryen tools are installed or disable wasm-opt setting.",
        );
        useWasmOpt = false;
      }

      return {
        server: {
          watch: {
            ignored: ["**/.build/**"],
          },
        },
      };
    },

    resolveId(id) {
      return resolveSwiftWasmVirtualModule(id);
    },

    async load(id) {
      const request = parseResolvedSwiftWasmVirtualModule(id);
      if (!request) {
        return null;
      }

      const product = await resolveProduct(request);
      const builder = createBuildModeBuilder(
        request,
        await resolveBuildOptions(product),
        swift,
      );
      await builder.prepare?.();

      logger.info(`Building ${product}...`);
      console.debug(
        colors.bold(
          colors.gray(
            `$ ${swift.command} ${quoteArgsForDisplay(builder.commandArgs)}`,
          ),
        ),
      );

      const build = async (): Promise<BuildOutput> => {
        const output = await builder.build();
        if (useWasmOpt) {
          await wasmOptimizer.optimize(output.wasmModule);
        }
        return output;
      };

      const output = await build();
      logger.info(
        `Done: ${colors.green(moduleImportSpecifier(output.entryModule))}`,
      );

      if (isDev) {
        watchedSourcesFolders = [path.resolve(packagePath, "Sources")];
        rebuild = createThrottledRebuilder(async () => {
          await build();
        }, logger.warn);
        logWatchedSources();
      }

      return builder.moduleSource(output);
    },

    hotUpdate(context) {
      if (
        !rebuild ||
        !context.file.endsWith(".swift") ||
        !watchedSourcesFolders.some((folder) => context.file.startsWith(folder))
      ) {
        return;
      }

      if (!reloadDebouncer.shouldReload()) {
        return [];
      }

      const relativeFile = path.relative(process.cwd(), context.file);
      logger.info(colors.green(`${relativeFile} changed, rebuilding...`));

      rebuild()
        .then(() => {
          context.server.ws.send({ type: "full-reload" });
        })
        .catch(() => {
          logger.warn(`Rebuild failed.`);
        });

      return [];
    },
  };

  async function resolveProduct(
    request: VirtualModuleRequest,
  ): Promise<string> {
    if (request.product) {
      return request.product;
    }

    const product = await swift.getSingleExecutableTarget(packagePath);
    if (product) {
      return product;
    }

    throw new Error(
      `Main executable product could not be determined, please use "import myApp from "${virtualModuleProductExample(request.mode)}".`,
    );
  }

  async function resolveBuildOptions(product: string): Promise<BuildOptions> {
    return {
      swiftSDK: await swift.resolveSDKID(useEmbeddedSwift),
      packagePath,
      product,
      configuration: isDev ? "debug" : "release",
      toolsetArgs: getToolsetBuildArgs(
        useEmbeddedSwift,
        options.linkEmbeddedUnicodeDataTables ?? true,
      ),
      extraBuildArgs: options.extraBuildArgs ?? [],
    };
  }

  function logWatchedSources(): void {
    const folders = watchedSourcesFolders
      .map((folder) => path.relative(process.cwd(), folder))
      .join(", ");
    logger.info(`Watching ${colors.green(folders)} for changes`);
  }
}

const logger = (() => {
  const viteLogger = createLogger(undefined, {
    prefix: colors.magenta("[swift-wasm]"),
  });

  return {
    info(message: string) {
      viteLogger.info(message, { timestamp: true });
    },
    warn(message: string) {
      viteLogger.warn(message, { timestamp: true });
    },
  };
})();
