export const VIRTUAL_MODULE_ID = "virtual:swift-wasm";
export const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;

export type BuildMode = "init" | "js";

export type VirtualModuleRequest = {
  mode: BuildMode;
  product?: string;
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
  const allowedParams = new Set(["init", "js", "product"]);

  for (const [key] of params) {
    if (!allowedParams.has(key)) {
      throw new Error(`Unknown query parameter: ${key}`);
    }
  }

  const modes = (["init", "js"] as const).flatMap((mode) =>
    params.getAll(mode).map(() => mode),
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

  for (const mode of ["init", "js"] as const) {
    for (const value of params.getAll(mode)) {
      if (value !== "") {
        throw new Error(`The "${mode}" query parameter does not take a value.`);
      }
    }
  }

  const products = params.getAll("product");
  if (products.length > 1) {
    throw new Error(
      `The "product" query parameter may only be specified once.`,
    );
  }
  if (products[0] === "") {
    throw new Error(`The "product" query parameter must not be empty.`);
  }

  return {
    mode: modes[0],
    product: products[0],
  };
}
