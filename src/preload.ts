import path from "node:path";
import type { HtmlTagDescriptor, Rollup } from "vite";

type Bundle = Rollup.OutputBundle;
type Chunk = Rollup.OutputChunk;

/**
 * Collects the emitted files of built WebAssembly modules that the given HTML
 * entry chunk loads through its static import graph.
 *
 * Dynamically imported chunks are skipped, so lazily loaded apps are not preloaded.
 */
export function collectPreloadedWasmFiles(
  entry: Chunk,
  bundle: Bundle,
  isBuiltWasm: (originalFileName: string) => boolean,
): string[] {
  const files = new Set<string>();
  const visited = new Set<string>();

  const visit = (chunk: Chunk) => {
    if (visited.has(chunk.fileName)) {
      return;
    }
    visited.add(chunk.fileName);

    for (const fileName of chunk.viteMetadata?.importedAssets ?? []) {
      const asset = bundle[fileName];
      if (
        asset?.type === "asset" &&
        asset.originalFileNames.some(isBuiltWasm)
      ) {
        files.add(fileName);
      }
    }

    for (const fileName of chunk.imports) {
      const imported = bundle[fileName];
      if (imported?.type === "chunk") {
        visit(imported);
      }
    }
  };

  visit(entry);
  return [...files];
}

export function wasmPreloadTag(href: string): HtmlTagDescriptor {
  return {
    tag: "link",
    // `crossorigin` makes the preload match the CORS-mode `fetch(url)` of the loaders.
    attrs: {
      rel: "preload",
      href,
      as: "fetch",
      type: "application/wasm",
      crossorigin: "",
    },
    injectTo: "head",
  };
}

/**
 * Resolves the URL of an emitted file as referenced from the given HTML page,
 * following Vite's handling of relative and absolute `base` values.
 */
export function outputFileHref(
  fileName: string,
  htmlPath: string,
  base: string,
): string {
  if (base === "" || base === "./") {
    const href = path.posix.relative(
      path.posix.dirname(htmlPath),
      `/${fileName}`,
    );
    return href.startsWith(".") ? href : `./${href}`;
  }

  return `${base.endsWith("/") ? base : `${base}/`}${fileName}`;
}
