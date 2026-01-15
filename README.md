# @elementary-swift/vite-plugin-swift-wasm

A Vite plugin for Swift WebAssembly integration.

## Features

- add support for importing an executable target from a local SwiftPM package
- simple syntax: `import myApp from "virtual:swift-wasm?init"`
- automatically detects matching Swift SDK for WebAssembly and builds a reactor module
- watches changes of \*.swift files and triggers instant rebuild and reload
- for release builds: optimizes binary using wasm-opt (must be installed separately)
- supports [Embedded Swift](https://docs.swift.org/embedded/documentation/embedded/) build mode (via `wasm-embedded` Swift SDK)
- automatically links [swiftUnicodeDataTables](https://docs.swift.org/embedded/documentation/embedded/strings/) when using Embedded Swift

## Installation

```bash
pnpm i -D @elementary-swift/vite-plugin-swift-wasm

# or
# npm i -D @elementary-swift/vite-plugin-swift-wasm


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

```ts
// index.ts
import myApp from "virtual:swift-wasm?init&product=MyApp";

const wasmInstance = myApp();

const wasmInstanceWithImports = myApp({ someImport, moreImports });

// product name can be omitted if only one executable target in the package
// import myApp from "virtual:swift-wasm?init";
```

## Configuration

All options with their default values:

```ts
swiftWasm({
  // Path to the Swift package
  packagePath: ".",

  // Additional arguments to pass to swift build
  extraBuildArgs: [],

  // Use Embedded Swift variant (production builds only)
  // Produces smaller binaries with reduced runtime overhead
  useEmbeddedSDK: false,

  // Link Swift Unicode data tables when building with Embedded Swift
  // Only relevant when useEmbeddedSDK is true
  linkEmbeddedUnicodeDataTables: true,

  // Optimize WebAssembly module with wasm-opt (production builds only)
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
