declare module "virtual:swift-wasm?init*" {
  /**
   * Instantiates the Swift WebAssembly module.
   * @param importObject - The import object for the instance.
   * @returns A promise that resolves to the WebAssembly instance.
   */
  const initWasm: (
    importObject?: WebAssembly.Imports,
  ) => Promise<WebAssembly.Instance>;
  export default initWasm;
}

declare module "virtual:swift-wasm?js*" {
  /**
   * Initializes the JavaScriptKit PackageToJS module.
   *
   * Project-specific bridge types are emitted by PackageToJS alongside its
   * generated JavaScript entry module.
   */
  export const init: (options?: unknown) => Promise<unknown>;
}
