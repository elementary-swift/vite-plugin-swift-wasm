import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  getWatchIgnorePattern,
  isPathInsideDirectory,
  isWatchedSwiftSource,
} from "../src/watch.ts";

test("ignores the configured SwiftPM scratch directory", () => {
  assert.equal(
    getWatchIgnorePattern("Examples/Worker", ".swiftpm/build"),
    `${path.resolve("Examples/Worker/.swiftpm/build").split(path.sep).join("/")}/**`,
  );
});

test("matches paths only within a complete directory boundary", () => {
  const sourceDirectory = path.resolve("Sources/App");

  assert.equal(
    isPathInsideDirectory(
      path.join(sourceDirectory, "Nested", "Feature.swift"),
      sourceDirectory,
    ),
    true,
  );
  assert.equal(
    isPathInsideDirectory(
      path.resolve("Sources/AppExtra/Feature.swift"),
      sourceDirectory,
    ),
    false,
  );
  assert.equal(
    isPathInsideDirectory(
      path.resolve("Sources/Feature.swift"),
      sourceDirectory,
    ),
    false,
  );
});

test("watches only Swift files inside selected source directories", () => {
  const workerSources = path.resolve("Sources/Worker");
  const sharedSources = path.resolve("Modules/Shared");
  const watchedDirectories = [workerSources, sharedSources];

  assert.equal(
    isWatchedSwiftSource(
      path.join(sharedSources, "Messages.swift"),
      watchedDirectories,
    ),
    true,
  );
  assert.equal(
    isWatchedSwiftSource(
      path.join(workerSources, "config.json"),
      watchedDirectories,
    ),
    false,
  );
  assert.equal(
    isWatchedSwiftSource(
      path.resolve("Sources/WebApp/App.swift"),
      watchedDirectories,
    ),
    false,
  );
});
