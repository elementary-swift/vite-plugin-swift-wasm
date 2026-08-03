import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("documents the portable WebAssembly.Module import mode", () => {
  assert.match(readme, /virtual:swift-wasm\?js&module&product=Worker/);
  assert.match(readme, /PackageToJS-generated `Worker\.wasm\?module`/);
  assert.match(readme, /explicit option overrides the imported module/);
  assert.match(readme, /`module` flag is supported only by `\?js`/);
});
