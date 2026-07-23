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
  type ModuleSource =
    | WebAssembly.Module
    | ArrayBufferView
    | ArrayBuffer
    | Response
    | PromiseLike<Response>;

  type Imports = object;
  type Exports = object;

  type Options = {
    /**
     * The WebAssembly module to instantiate.
     *
     * If omitted, the module is fetched from its default path.
     */
    module?: ModuleSource;
    /** The project-specific imports required by the WebAssembly module. */
    getImports: () => Imports;
  };

  /**
   * Initializes the JavaScriptKit PackageToJS module.
   *
   * Project-specific bridge types are emitted by PackageToJS alongside its
   * generated JavaScript entry module.
   */
  export function init(options?: Options): Promise<{
    instance: WebAssembly.Instance;
    exports: Exports;
  }>;
}
