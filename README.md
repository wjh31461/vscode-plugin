# vscode-plugin

这是一个面向 JS / TS 的最小可运行 VS Code 插件原型，基于 `tree-sitter` 做 AST 解析，并演示以下本地交互能力：

- 监听文件变化和编辑器内容变化
- 将命中的代码片段标红高亮
- 输出诊断信息
- 在悬浮时显示提示内容

## 当前演示规则

- `debugger`：标记为错误
- `console.log(...)`：标记为警告

## 本地运行

1. 安装依赖：

   ```bash
   npm install
   ```

   如果你使用 `pnpm`：

   ```bash
   pnpm install
   ```

   如果出现 `ERR_PNPM_IGNORED_BUILDS`，先执行：

   ```bash
   pnpm approve-builds
   ```

   然后允许以下依赖的构建脚本：

   - `tree-sitter`
   - `tree-sitter-javascript`
   - `tree-sitter-typescript`

2. 编译项目：

   ```bash
   npm run compile
   ```

   或：

   ```bash
   pnpm compile
   ```

3. 用 VS Code 打开当前仓库目录。
4. 按 `F5` 启动 Extension Development Host。
5. 在新打开的调试窗口里，打开任意 `.js`、`.jsx`、`.ts` 或 `.tsx` 文件，并输入：

   ```ts
   debugger;
   console.log("hello");
   ```

你应该会看到红色高亮、诊断信息，以及鼠标悬浮提示。

## 项目结构

- [src/extension.ts](/Users/wangjiahui/EB/Repos/my-repos/vscode-plugin/src/extension.ts)：扩展入口与核心逻辑
- [package.json](/Users/wangjiahui/EB/Repos/my-repos/vscode-plugin/package.json)：扩展清单、依赖与脚本配置

## 说明

这个版本刻意保持得很小，目的是先把整条链路跑通：

`文件/文本变化 -> AST 解析 -> 规则命中 -> diagnostics / decorations / hover`

后续可以继续往下扩展，比如：

- 抽成独立规则引擎
- 支持更多 AST 规则
- 增加 `CodeAction` 快速修复
- 演进成更完整的 Language Server / Linter 架构
