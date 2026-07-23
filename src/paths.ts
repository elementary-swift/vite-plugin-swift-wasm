import path from "node:path";

export function moduleImportSpecifier(absolutePath: string): string {
  let relativePath = path.relative(process.cwd(), absolutePath);
  const isExplicitRelativePath =
    relativePath === "." ||
    relativePath === ".." ||
    relativePath.startsWith(`.${path.sep}`) ||
    relativePath.startsWith(`..${path.sep}`);

  if (!isExplicitRelativePath && !path.isAbsolute(relativePath)) {
    relativePath = `.${path.sep}${relativePath}`;
  }

  return relativePath.split(path.sep).join("/");
}
