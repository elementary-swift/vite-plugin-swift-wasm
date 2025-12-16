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
