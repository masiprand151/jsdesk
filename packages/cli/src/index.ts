#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

import { buildProject } from "@jsdesk/compiler";

function printUsage() {
  console.log(
    "Jsdesk CLI\n\nUsage:\n  jsdesk build <input.tsx> [--out <output-dir>]\n  jsdesk dev <input.tsx> [--out <output-dir>]\n",
  );
}

function runBuild(inputPath: string, outputDir: string) {
  const result = buildProject({
    inputFile: inputPath,
    outputDir,
  });

  if (!result.success) {
    for (const diagnostic of result.diagnostics) {
      console.error(`[${diagnostic.code}] ${diagnostic.message}`);
      console.error(
        `File: ${diagnostic.file} Line: ${diagnostic.line} Column: ${diagnostic.column}`,
      );
      if (diagnostic.feature) {
        console.error(`Feature: ${diagnostic.feature}`);
      }
      if (diagnostic.suggestion) {
        console.error(`Suggestion: ${diagnostic.suggestion}`);
      }
    }
    return false;
  }

  console.log(`Jsdesk build succeeded.`);
  console.log(`Generated files:`);
  for (const file of result.outputFiles) {
    console.log(`  - ${path.relative(process.cwd(), file)}`);
  }

  const csprojPath = path.join(outputDir, "Jsdesk.Generated.csproj");
  if (fs.existsSync(csprojPath)) {
    const dotnet = spawnSync(
      process.platform === "win32" ? "dotnet.exe" : "dotnet",
      ["build", csprojPath, "-c", "Debug"],
      {
        stdio: "inherit",
        shell: false,
      },
    );

    if (dotnet.status !== 0) {
      console.error("dotnet build failed for the generated Jsdesk app.");
      return false;
    }
  }

  return true;
}

function startDevWatcher(inputPath: string, outputDir: string) {
  const watchedDir = path.dirname(path.resolve(inputPath));
  const projectFile = path.join(outputDir, "Jsdesk.Generated.csproj");

  console.log(`Watching ${watchedDir} for changes...`);
  console.log(`Build output: ${outputDir}`);

  const runOnce = () => {
    console.log(`\n[dev] Rebuilding ${inputPath}`);
    runBuild(inputPath, outputDir);
  };

  runOnce();

  const watcher = fs.watch(
    watchedDir,
    { persistent: true },
    (_eventType, filename) => {
      if (!filename) {
        return;
      }

      const changedFile = path.resolve(watchedDir, filename.toString());
      if (
        changedFile === path.resolve(inputPath) ||
        changedFile.startsWith(path.resolve(watchedDir))
      ) {
        runOnce();
      }
    },
  );

  if (fs.existsSync(projectFile)) {
    console.log(`Project ready: ${projectFile}`);
  }

  process.on("SIGINT", () => {
    console.log("Stopping Jsdesk dev watcher.");
    watcher.close();
    process.exit(0);
  });

  process.stdin.resume();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const command = args[0];
  const inputPath = args[1] ?? "examples/App.tsx";
  const outIndex = args.indexOf("--out");
  const outputDir =
    outIndex >= 0
      ? args[outIndex + 1]
      : path.join(process.cwd(), "dist", "generated");

  if (command === "build") {
    const ok = runBuild(inputPath, outputDir);
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (command === "dev") {
    startDevWatcher(inputPath, outputDir);
    return;
  }

  console.error(`Unsupported command: ${command}`);
  printUsage();
  process.exitCode = 1;
}

main();
