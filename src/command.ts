import { spawn } from "node:child_process";
import colors from "picocolors";

export type RunCommandOptions = {
  capture?: boolean;
};

export class CommandRunner {
  async run(
    command: string,
    args: string[],
    options: RunCommandOptions = {},
  ): Promise<string | undefined> {
    const capture = options.capture ?? false;

    return await new Promise<string | undefined>((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";

      child.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        if (capture) {
          stdout += text;
        } else {
          console.debug(colors.gray(text.trimEnd()));
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        console.debug(colors.yellow(data.toString().trimEnd()));
      });

      child.on("error", reject);
      child.on("close", (code: number | null) => {
        if (code === 0) {
          resolve(capture ? stdout.trim() : undefined);
          return;
        }

        reject(
          new Error(
            `Command failed (${code}): ${command} ${quoteArgsForDisplay(args)}`,
          ),
        );
      });
    });
  }

  async capture(command: string, args: string[]): Promise<string> {
    return (await this.run(command, args, { capture: true })) ?? "";
  }
}

export function quoteArgsForDisplay(args: string[]): string {
  return args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
}
