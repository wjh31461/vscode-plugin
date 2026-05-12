# vscode-plugin

A minimal VS Code extension prototype for JS/TS that uses `tree-sitter` AST parsing to:

- watch file and text changes
- mark AST-matched code in red
- surface diagnostics
- show hover messages on flagged nodes

## Current demo rules

- `debugger` -> error
- `console.log(...)` -> warning

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile:

   ```bash
   npm run compile
   ```

3. Open this folder in VS Code.
4. Press `F5` to launch the Extension Development Host.
5. Open any `.js`, `.jsx`, `.ts`, or `.tsx` file and try:

   ```ts
   debugger;
   console.log("hello");
   ```

You should see red highlighting, diagnostics, and hover text.

## Extension shape

- [src/extension.ts](/Users/wangjiahui/EB/Repos/my-repos/vscode-plugin/src/extension.ts)
- [package.json](/Users/wangjiahui/EB/Repos/my-repos/vscode-plugin/package.json)

This is intentionally small so you can extend it into richer AST rules, code actions, or a language server later.
