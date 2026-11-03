import assert from "node:assert/strict";
import test from "node:test";
import type { Rollup } from "vite";
import {
  collectPreloadedWasmFiles,
  outputFileHref,
  wasmPreloadTag,
} from "../src/preload.ts";

function chunk(
  fileName: string,
  imports: string[] = [],
  importedAssets: string[] = [],
  dynamicImports: string[] = [],
): Rollup.OutputChunk {
  return {
    type: "chunk",
    fileName,
    imports,
    dynamicImports,
    viteMetadata: {
      importedAssets: new Set(importedAssets),
      importedCss: new Set(),
    },
  } as unknown as Rollup.OutputChunk;
}

function asset(fileName: string, originalFileName: string): Rollup.OutputAsset {
  return {
    type: "asset",
    fileName,
    originalFileNames: [originalFileName],
  } as unknown as Rollup.OutputAsset;
}

function bundleOf(
  ...items: (Rollup.OutputChunk | Rollup.OutputAsset)[]
): Rollup.OutputBundle {
  return Object.fromEntries(items.map((item) => [item.fileName, item]));
}

const isBuiltWasm = (name: string) => name.endsWith("App.wasm");

test("collects built wasm referenced through static imports", () => {
  const entry = chunk("assets/index.js", ["assets/shared.js"]);
  const bundle = bundleOf(
    entry,
    chunk("assets/shared.js", ["assets/index.js"], ["assets/App-abc.wasm"]),
    asset("assets/App-abc.wasm", ".build/out/App.wasm"),
  );

  assert.deepEqual(collectPreloadedWasmFiles(entry, bundle, isBuiltWasm), [
    "assets/App-abc.wasm",
  ]);
});

test("ignores wasm only reachable through dynamic imports", () => {
  const entry = chunk("assets/index.js", [], [], ["assets/lazy.js"]);
  const bundle = bundleOf(
    entry,
    chunk("assets/lazy.js", [], ["assets/App-abc.wasm"]),
    asset("assets/App-abc.wasm", ".build/out/App.wasm"),
  );

  assert.deepEqual(collectPreloadedWasmFiles(entry, bundle, isBuiltWasm), []);
});

test("ignores wasm assets not built by the plugin", () => {
  const entry = chunk("assets/index.js", [], ["assets/other-abc.wasm"]);
  const bundle = bundleOf(
    entry,
    asset("assets/other-abc.wasm", "src/other.wasm"),
  );

  assert.deepEqual(collectPreloadedWasmFiles(entry, bundle, isBuiltWasm), []);
});

test("resolves hrefs for relative and absolute bases", () => {
  assert.equal(
    outputFileHref("assets/App.wasm", "/index.html", "./"),
    "./assets/App.wasm",
  );
  assert.equal(
    outputFileHref("assets/App.wasm", "/nested/page.html", ""),
    "../assets/App.wasm",
  );
  assert.equal(
    outputFileHref("assets/App.wasm", "/index.html", "/"),
    "/assets/App.wasm",
  );
  assert.equal(
    outputFileHref("assets/App.wasm", "/index.html", "/app/"),
    "/app/assets/App.wasm",
  );
});

test("preload tag matches CORS-mode fetch requests", () => {
  assert.deepEqual(wasmPreloadTag("./assets/App.wasm").attrs, {
    rel: "preload",
    href: "./assets/App.wasm",
    as: "fetch",
    type: "application/wasm",
    crossorigin: "",
  });
});
