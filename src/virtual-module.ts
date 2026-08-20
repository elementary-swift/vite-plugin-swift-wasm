export const VIRTUAL_MODULE_ID = "virtual:swift-wasm";
export const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

export type BuildMode = "init" | "js";
const BUILD_MODES: readonly BuildMode[] = ["init", "js"];
const QUERY_PARAMETERS = new Set([...BUILD_MODES, "module", "product"]);

export type VirtualModuleRequest = {
  mode: BuildMode;
  product?: string;
  module?: boolean;
};

export function resolveSwiftWasmVirtualModule(id: string): string | null {
  if (!isPublicVirtualModuleId(id)) {
    return null;
  }

  return `\0${id}`;
}

export function parseResolvedSwiftWasmVirtualModule(
  id: string,
): VirtualModuleRequest | null {
  if (!isResolvedVirtualModuleId(id)) {
    return null;
  }

  return parseVirtualModuleRequest(id.slice(1));
}

export function virtualModuleId(mode: BuildMode, product?: string): string {
  const productQuery = product ? `&product=${encodeURIComponent(product)}` : "";
  return `${VIRTUAL_MODULE_ID}?${mode}${productQuery}`;
}

export function virtualModuleProductExample(mode: BuildMode): string {
  return `${virtualModuleId(mode)}&product=<target-name>`;
}

function isPublicVirtualModuleId(id: string): boolean {
  return id === VIRTUAL_MODULE_ID || id.startsWith(`${VIRTUAL_MODULE_ID}?`);
}

function isResolvedVirtualModuleId(id: string): boolean {
  return (
    id === RESOLVED_VIRTUAL_MODULE_ID ||
    id.startsWith(`${RESOLVED_VIRTUAL_MODULE_ID}?`)
  );
}

function parseVirtualModuleRequest(id: string): VirtualModuleRequest {
  const query = id.slice(VIRTUAL_MODULE_ID.length);
  const params = new URLSearchParams(
    query.startsWith("?") ? query.slice(1) : "",
  );
  for (const [key] of params) {
    if (!QUERY_PARAMETERS.has(key)) {
      throw new Error(`Unknown query parameter: ${key}`);
    }
  }

  const mode = parseBuildMode(params);
  const product = parseOptionalValue(params, "product");
  const importModule = parseOptionalFlag(params, "module");

  return {
    mode,
    ...(product !== undefined ? { product } : {}),
    ...(importModule ? { module: true } : {}),
  };
}

function parseBuildMode(params: URLSearchParams): BuildMode {
  const modes = BUILD_MODES.flatMap((mode) =>
    params.getAll(mode).map((value) => ({ mode, value })),
  );

  if (modes.length === 0) {
    throw new Error(
      `A build mode is required; use "${virtualModuleId("init")}" or "${virtualModuleId("js")}".`,
    );
  }

  if (modes.length > 1) {
    throw new Error(
      `Specify exactly one build mode: "${virtualModuleId("init")}" or "${virtualModuleId("js")}".`,
    );
  }

  const [{ mode, value }] = modes;
  if (value !== "") {
    throw new Error(`The "${mode}" query parameter does not take a value.`);
  }

  return mode;
}

function parseOptionalFlag(params: URLSearchParams, name: string): boolean {
  const value = parseOptionalParameter(params, name);
  if (value !== undefined && value !== "") {
    throw new Error(`The "${name}" query parameter does not take a value.`);
  }

  return value !== undefined;
}

function parseOptionalValue(
  params: URLSearchParams,
  name: string,
): string | undefined {
  const value = parseOptionalParameter(params, name);
  if (value === "") {
    throw new Error(`The "${name}" query parameter must not be empty.`);
  }

  return value;
}

function parseOptionalParameter(
  params: URLSearchParams,
  name: string,
): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new Error(
      `The "${name}" query parameter may only be specified once.`,
    );
  }

  return values[0];
}
