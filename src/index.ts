import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, createLogger } from "vite";
import colors from "picocolors";

let wasmOptBin: string = process.env.WASM_OPT_BIN ?? "wasm-opt";
let swiftBin: string = process.env.SWIFT_BIN ?? "swift";
let swiftSDKID: string | undefined = process.env.SWIFT_SDK_ID;

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

export default function swiftWasm(options?: SwiftWasmPluginOptions): Plugin {
  let useWasmOpt = options?.useWasmOpt ?? true;
  let useEmbeddedSwift = options?.useEmbeddedSDK ?? false;
  let linkEmbeddedUnicodeDataTables =
    options?.linkEmbeddedUnicodeDataTables ?? true;
  const wasmOptArgs = options?.wasmOptArgs ?? DEFAULT_WASM_OPT_ARGS;
  const packagePath = options?.packagePath ?? ".";
  const extraBuildArgs = options?.extraBuildArgs ?? [];

  const VIRTUAL_PREFIX = "virtual:swift-wasm?init";
  const RESOLVED_PREFIX = "\0" + VIRTUAL_PREFIX;

  // NOTE: this could theoretically be several, but not for now
  let wasmModule: string | undefined;
  let watchedSourcesFolders: string[] = [];
  let swiftBuildArgs: string[] = [];
  let isDev: boolean = false;
  let rebuildFn: (() => Promise<void>) | undefined;

  const reloadDebouncer = makeDebouncer(20);

  // Plugin implementation
  return {
    name: "swift-wasm-plugin",
    enforce: "pre",
    async config(_, { command }) {
      isDev = command === "serve";

      // never optimize in development
      if (isDev) {
        useWasmOpt = false;
        useEmbeddedSwift = false;
      }

      // check if wasm-opt is available if needed
      if (useWasmOpt) {
        try {
          await execCommand(wasmOptBin, ["--version"]);
        } catch (error) {
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
      }

      // add swift .build directory to ignored watch paths
      return {
        server: {
          watch: {
            ignored: ["**/.build/**"],
          },
        },
      };
    },
    async resolveId(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return "\0" + id;
      }
      return null;
    },
    async load(id) {
      if (id.startsWith(RESOLVED_PREFIX)) {
        const { product } = await resolveParams(id, packagePath);

        if (!product) {
          throw new Error(
            `Main executable product could not be determined, please use "import myApp from "${VIRTUAL_PREFIX}&product=<target-name>".`,
          );
        }

        const configuration = isDev ? "debug" : "release";

        swiftBuildArgs = getSwiftBuildArgs({
          swiftSDK: await resolveSwiftSDKID(useEmbeddedSwift),
          packagePath,
          product: product,
          configuration,
          extraBuildArgs: [
            ...toolsetBuildArgs(
              useEmbeddedSwift,
              linkEmbeddedUnicodeDataTables,
            ),
            ...extraBuildArgs,
          ],
        });

        logger.info(`Building ${product}...`);
        console.debug(
          colors.bold(
            colors.gray(
              `$ ${swiftBin} build ${quoteArgsForDisplay(swiftBuildArgs)}`,
            ),
          ),
        );

        await runSwiftBuild(swiftBuildArgs);

        if (isDev) {
          watchedSourcesFolders.push(path.resolve(packagePath, "Sources"));
          rebuildFn = createThrottledRebuilder(swiftBuildArgs);
        }

        const relativeBuildOutputPath = path.relative(
          process.cwd(),
          await getBuildOutputPath(swiftBuildArgs),
        );

        wasmModule = `./${relativeBuildOutputPath}/${product}.wasm`;

        if (useWasmOpt) {
          await optimizeWasm(wasmModule, wasmOptArgs);
        }

        logger.info(`Done: ${colors.green(wasmModule)}`);

        if (isDev) {
          logger.info(
            `Watching ${colors.green(
              watchedSourcesFolders
                .map((folder) => path.relative(process.cwd(), folder))
                .join(", "),
            )} for changes`,
          );
        }

        return `export { default } from "${wasmModule}?init";`;
      }
      return null;
    },
    hotUpdate(options) {
      if (
        rebuildFn &&
        options.file.endsWith(".swift") &&
        watchedSourcesFolders.some((folder) => options.file.startsWith(folder))
      ) {
        if (!reloadDebouncer.shouldReload()) {
          return [];
        }

        const relativeFile = path.relative(process.cwd(), options.file);
        logger.info(colors.green(`${relativeFile} changed, rebuilding...`));

        // TODO: maybe debounce builds too (only one pending build at a time)
        rebuildFn()
          .then(() => {
            options.server.ws.send({ type: "full-reload" });
          })
          .catch((error) => {
            logger.warn(`Rebuild failed.`);
          });

        return [];
      }
    },
  };
  // End of plugin implementation

  async function resolveParams(id: string, packagePath: string) {
    let product: string | undefined;

    const queryParams = id.slice(VIRTUAL_PREFIX.length).split("&").slice(1);

    for (const param of queryParams) {
      const [key, value] = param.split("=");
      switch (key) {
        case "product":
          product = value;
          break;
        default:
          throw new Error(`Unknown query parameter: ${key}`);
      }
    }

    if (!product) {
      const resolvedProduct = await getSingleExecutableTarget(packagePath);
      if (!resolvedProduct) {
        throw new Error(
          `Main executable product could not be determined, please use "import myApp from "${VIRTUAL_PREFIX}&product=<target-name>".`,
        );
      }
      product = resolvedProduct;
    }

    return {
      product,
    };
  }
}

async function resolveSwiftSDKID(useEmbeddedSwift: boolean): Promise<string> {
  if (swiftSDKID) {
    return swiftSDKID;
  }

  let compilerTag = await getSwiftCompilerTag();
  if (!compilerTag) {
    throw new Error(
      "Could not detect compiler tag for Swift SDK ID. Verify the Swift toolchain version or set the SWIFT_SDK_ID environment variable manually.",
    );
  }

  swiftSDKID = compilerTag + "_wasm";
  if (useEmbeddedSwift) {
    swiftSDKID += "-embedded";
  }

  return swiftSDKID;
}

type SwiftBuildOptions = {
  swiftSDK: string;
  packagePath: string;
  product: string;
  configuration: string;
  extraBuildArgs: string[];
};

function getSwiftBuildArgs(opts: SwiftBuildOptions): string[] {
  return [
    "--package-path",
    opts.packagePath,
    "--swift-sdk",
    opts.swiftSDK,
    "--configuration",
    opts.configuration,
    "--product",
    opts.product,
    ...opts.extraBuildArgs,
  ];
}

async function runSwiftBuild(args: string[]): Promise<void> {
  await runCommand(swiftBin, ["build", ...args]);
}

async function optimizeWasm(
  wasmPath: string,
  wasmOptArgs: string[],
): Promise<void> {
  logger.info(`Optimizing ${wasmPath}...`);

  const args = [wasmPath, "-o", wasmPath, ...wasmOptArgs];
  console.debug(
    colors.bold(colors.gray(`$ ${wasmOptBin} ${quoteArgsForDisplay(args)}`)),
  );
  await runCommand(wasmOptBin, args);
}

async function execCommand(cmd: string, args: string[]): Promise<string> {
  const output = await runCommand(cmd, args, { capture: true });
  return output ?? "";
}

async function getSwiftCompilerTag(): Promise<string | undefined> {
  const output = await execCommand(swiftBin, ["-print-target-info"]);
  const targetInfo = JSON.parse(output);
  return targetInfo.swiftCompilerTag;
}

async function getSingleExecutableTarget(
  packagePath: string,
): Promise<string | undefined> {
  const output = await execCommand(swiftBin, [
    "package",
    "show-executables",
    "--package-path",
    packagePath,
    "--format",
    "json",
  ]);
  const executables = JSON.parse(output).filter((e: any) => !e.package);
  if (executables.length !== 1) {
    return undefined;
  }
  return executables[0].name ?? undefined;
}

async function getBuildOutputPath(args: string[]): Promise<string> {
  return await execCommand(swiftBin, ["build", "--show-bin-path", ...args]);
}

function quoteArgsForDisplay(args: string[]): string {
  return args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
}

async function runCommand(
  cmd: string,
  args: string[],
  options?: { capture?: boolean },
): Promise<string | undefined> {
  const capture = options?.capture ?? false;

  // Set up environment with node_modules/.bin in PATH if needed
  const env = { ...process.env };

  return await new Promise<string | undefined>((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";

    child.stdout.on("data", (d: Buffer) => {
      const data = d.toString();
      if (capture) {
        stdout += data;
      } else {
        console.debug(colors.gray(data.trimEnd()));
      }
    });

    child.stderr.on("data", (d: Buffer) =>
      console.debug(colors.yellow(d.toString().trimEnd())),
    );

    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(capture ? stdout.trim() : undefined);
      else
        reject(
          new Error(
            `Command failed (${code}): ${cmd} ${quoteArgsForDisplay(args)}`,
          ),
        );
    });
  });
}

function makeDebouncer(delayMs: number) {
  let lastTime = 0;
  return {
    shouldReload: () => {
      const now = Date.now();
      if (now - lastTime < delayMs) {
        return false;
      }
      lastTime = now;
      return true;
    },
  };
}

function createThrottledRebuilder(swiftBuildArgs: string[]) {
  let runningBuildCount = 0;
  let queuedRebuild: Promise<void> | null = null;

  return async () => {
    if (queuedRebuild) {
      return queuedRebuild;
    }

    runningBuildCount++;
    try {
      let currentBuild = runSwiftBuild(swiftBuildArgs);
      if (runningBuildCount > 1) {
        queuedRebuild = currentBuild;
      }

      await currentBuild;
    } finally {
      if (runningBuildCount > 2) {
        logger.warn(`This should not happen: runningBuildCount > 2`);
      }
      runningBuildCount--;
      if (runningBuildCount === 1) {
        queuedRebuild = null;
      }
    }
  };
}

function toolsetBuildArgs(
  isEmbedded: boolean,
  linkEmbeddedUnicodeDataTables: boolean,
): string[] {
  let args: string[] = [];

  if (isEmbedded && linkEmbeddedUnicodeDataTables) {
    args.push(
      "--toolset",
      toolsetPathFromPwd("../utils/embedded-unicode-toolset.json"),
    );
  }

  args.push(
    "--toolset",
    toolsetPathFromPwd("../utils/wasm-reactor-toolset.json"),
  );

  return args;
}

function toolsetPathFromPwd(toolsetPathRelativeToThisModule: string): string {
  const absPath = fileURLToPath(
    new URL(toolsetPathRelativeToThisModule, import.meta.url),
  );
  let relPath = path.relative(process.cwd(), absPath);

  // Make it explicit that this is a relative path (helps when printing commands)
  if (!relPath.startsWith(".") && !path.isAbsolute(relPath)) {
    relPath = `.${path.sep}${relPath}`;
  }

  return relPath;
}

const logger = (() => {
  const _logger = createLogger(undefined, {
    prefix: colors.magenta("[swift-wasm]"),
  });

  return {
    info: (message: string) => {
      _logger.info(message, { timestamp: true });
    },
    warn: (message: string) => {
      _logger.warn(message, { timestamp: true });
    },
  };
})();
