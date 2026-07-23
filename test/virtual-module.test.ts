import assert from "node:assert/strict";
import test from "node:test";
import {
  parseResolvedSwiftWasmVirtualModule,
  resolveSwiftWasmVirtualModule,
  virtualModuleId,
} from "../src/virtual-module.ts";

test("resolves only Swift Wasm virtual module IDs", () => {
  assert.equal(
    resolveSwiftWasmVirtualModule("virtual:swift-wasm?init"),
    "\0virtual:swift-wasm?init",
  );
  assert.equal(resolveSwiftWasmVirtualModule("virtual:swift-wasm-extra"), null);
  assert.equal(resolveSwiftWasmVirtualModule("./ordinary-module.js"), null);
});

test("parses resolved init and js requests", () => {
  assert.deepEqual(
    parseResolvedSwiftWasmVirtualModule(
      "\0virtual:swift-wasm?init&product=MyApp",
    ),
    { mode: "init", product: "MyApp" },
  );
  assert.deepEqual(
    parseResolvedSwiftWasmVirtualModule(
      "\0virtual:swift-wasm?js&product=My%20App",
    ),
    { mode: "js", product: "My App" },
  );
  assert.equal(
    parseResolvedSwiftWasmVirtualModule("virtual:swift-wasm?init"),
    null,
  );
});

test("requires exactly one empty mode selector", () => {
  assert.throws(
    () => parseResolvedSwiftWasmVirtualModule("\0virtual:swift-wasm"),
    /build mode is required/,
  );
  assert.throws(
    () => parseResolvedSwiftWasmVirtualModule("\0virtual:swift-wasm?init&js"),
    /exactly one build mode/,
  );
  assert.throws(
    () =>
      parseResolvedSwiftWasmVirtualModule("\0virtual:swift-wasm?js=enabled"),
    /does not take a value/,
  );
});

test("rejects invalid query parameters", () => {
  assert.throws(
    () =>
      parseResolvedSwiftWasmVirtualModule(
        "\0virtual:swift-wasm?js&target=MyApp",
      ),
    /Unknown query parameter: target/,
  );
  assert.throws(
    () =>
      parseResolvedSwiftWasmVirtualModule(
        "\0virtual:swift-wasm?init&product=One&product=Two",
      ),
    /may only be specified once/,
  );
  assert.throws(
    () =>
      parseResolvedSwiftWasmVirtualModule("\0virtual:swift-wasm?init&product="),
    /must not be empty/,
  );
});

test("constructs public virtual module IDs", () => {
  assert.equal(virtualModuleId("init"), "virtual:swift-wasm?init");
  assert.equal(
    virtualModuleId("js", "My App"),
    "virtual:swift-wasm?js&product=My%20App",
  );
});
