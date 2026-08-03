# @elementary-swift/vite-plugin-swift-wasm

A Vite plugin for Swift WebAssembly integration.

## Features

- add support for importing an executable target from a local SwiftPM package
- supports [JavaScriptKit](https://github.com/swiftwasm/JavaScriptKit/) and BridgeJS through the `swift package js` plugin (`?js`)
- supports [manual WebAssembly initialization](https://vite.dev/guide/features#webassembly) with plain `swift build` (`?init`)
- automatically detects matching Swift SDK for WebAssembly and builds a reactor module
- watches changes of \*.swift files and triggers instant rebuild and reload
- for release builds: optimizes binary using wasm-opt (must be installed separately)
- supports [Embedded Swift](https://docs.swift.org/embedded/documentation/embedded/) build mode (via `wasm-embedded` Swift SDK)
- automatically links [swiftUnicodeDataTables](https://docs.swift.org/embedded/documentation/embedded/strings/) when using Embedded Swift

## Installation

```bash
npm i -D @elementary-swift/vite-plugin-swift-wasm
# or
# pnpm i -D @elementary-swift/vite-plugin-swift-wasm

# TypeScript: Add @elementary-swift/vite-plugin-swift-wasm/client to types configuration
```

Requires Swift 6.2 or newer from [swift.org](https://www.swift.org/install) and a matching [Swift SDK for WebAssembly](https://www.swift.org/documentation/articles/wasm-getting-started.html).

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import swiftWasm from "@elementary-swift/vite-plugin-swift-wasm";

export default defineConfig({
  plugins: [swiftWasm()],
});
```

### JavaScriptKit / BridgeJS

The `?js` mode runs `swift package js` and re-exports the generated module.
The Swift package must have a dependency on [JavaScriptKit](https://github.com/swiftwasm/JavaScriptKit), which provides the `js` package command.

```ts
// index.ts
import { init } from "virtual:swift-wasm?js&product=MyApp";

const wasmInstance = await init();

// product name can be omitted if only one executable target is in the package
// import { init } from "virtual:swift-wasm?js";
```

For runtimes that accept a precompiled `WebAssembly.Module`, such as worker
environments, add the `module` flag:

```ts
import { init } from "virtual:swift-wasm?js&module&product=Worker";

const wasmInstance = await init();
```

This imports the PackageToJS-generated `Worker.wasm?module` and uses it as
`options.module`. The flag depends only on the bundler's `?module` support and
does not detect a specific runtime. All other PackageToJS exports remain
available, and an explicit option overrides the imported module:

```ts
await init({ module: anotherModule });
```

The `module` flag is supported only by `?js`; `?init&module` is invalid.

### Manual WebAssembly initialization

The `?init` mode runs a plain `swift build` and re-exports Vite's
[manual WebAssembly initialization](https://vite.dev/guide/features#webassembly) function.

```ts
// index.ts
import myApp from "virtual:swift-wasm?init&product=MyApp";

const wasmInstance = myApp();

const wasmInstanceWithImports = myApp({ someImport, moreImports });

// product name can be omitted if there is only one executable target in the package
// import myApp from "virtual:swift-wasm?init";
```

## Configuration

All options with their default values:

```ts
swiftWasm({
  // Path to the Swift package
  packagePath: ".",

  // Additional arguments passed to the Swift build command
  // In ?js mode, these are passed to `swift package` after --swift-sdk.
  extraBuildArgs: [],

  // Use Embedded Swift variant (production builds only)
  // Produces smaller binaries with reduced runtime overhead
  useEmbeddedSDK: false,

  // Link Swift Unicode data tables when building with Embedded Swift
  // Only relevant when useEmbeddedSDK is true
  linkEmbeddedUnicodeDataTables: true,

  // Optimize the generated WebAssembly module with wasm-opt
  // (production builds only, including ?js mode)
  useWasmOpt: true,

  // Arguments to pass to wasm-opt
  wasmOptArgs: ["-Os", "--strip-debug"],
});
```

## Publishing

```sh
pnpm version [patch | minor | major]
git push --follow-tags
```
