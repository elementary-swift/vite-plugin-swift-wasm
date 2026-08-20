import path from "node:path";

export function getWatchIgnorePattern(
  packagePath: string,
  scratchPath: string,
): string {
  const absoluteScratchPath = path.resolve(packagePath, scratchPath);
  return `${absoluteScratchPath.split(path.sep).join("/")}/**`;
}

export function isPathInsideDirectory(
  filePath: string,
  directoryPath: string,
): boolean {
  const relativePath = path.relative(directoryPath, filePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

export function isWatchedSwiftSource(
  filePath: string,
  sourceDirectories: string[],
): boolean {
  return (
    filePath.endsWith(".swift") &&
    sourceDirectories.some((directory) =>
      isPathInsideDirectory(filePath, directory),
    )
  );
}
