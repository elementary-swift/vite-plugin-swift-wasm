import colors from "picocolors";
import type { CommandRunner } from "./command.ts";
import { quoteArgsForDisplay } from "./command.ts";

type WasmOptLogger = {
  info(message: string): void;
};

export class WasmOptimizer {
  constructor(
    private readonly runner: CommandRunner,
    readonly command: string,
    private readonly args: string[],
    private readonly logger: WasmOptLogger,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.runner.capture(this.command, ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async optimize(wasmPath: string): Promise<void> {
    this.logger.info(`Optimizing ${wasmPath}...`);
    const args = [wasmPath, "-o", wasmPath, ...this.args];
    console.debug(
      colors.bold(
        colors.gray(`$ ${this.command} ${quoteArgsForDisplay(args)}`),
      ),
    );
    await this.runner.run(this.command, args);
  }
}
