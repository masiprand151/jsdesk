# Jsdesk

Jsdesk is a minimal Windows desktop framework foundation that compiles a restricted TSX subset into a WPF application.

## Current Phase 1 status

- TSX parser for a constrained JS-style component tree
- IR and C# / XAML generation for Window, Column, Text, and Button
- CLI command: `jsdesk build`
- .NET WPF build verification

## Quick start

```bash
npm install
npm run build
node dist/packages/cli/src/index.js build examples/hello-world/App.tsx --out dist/generated
```

The generated app is produced under the output directory and can be built using `dotnet build` on the generated project file.
