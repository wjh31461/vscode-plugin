import * as vscode from "vscode";
import Parser, { SyntaxNode } from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

type SupportedLanguage =
  | "javascript"
  | "javascriptreact"
  | "typescript"
  | "typescriptreact";

type AnalysisIssue = {
  range: vscode.Range;
  severity: vscode.DiagnosticSeverity;
  message: string;
  code: string;
  hover: string;
};

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
]);

const parserByLanguage = new Map<SupportedLanguage, Parser>();
const issuesByDocument = new Map<string, AnalysisIssue[]>();

const diagnosticCollection = vscode.languages.createDiagnosticCollection("ast-watchdog");
const highlightDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(255, 0, 0, 0.12)",
  border: "1px solid rgba(255, 0, 0, 0.35)",
  borderRadius: "2px",
  overviewRulerColor: "rgba(255, 0, 0, 0.8)",
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export function activate(context: vscode.ExtensionContext): void {
  // 为每种支持的语言模式各初始化一个 parser，后续扫描时直接复用。
  initializeParsers();

  const refreshDocument = (document: vscode.TextDocument): void => {
    if (!isSupportedDocument(document)) {
      clearDocumentState(document.uri);
      return;
    }

    const issues = analyzeDocument(document);
    issuesByDocument.set(document.uri.toString(), issues);
    diagnosticCollection.set(document.uri, issues.map(toDiagnostic));
    refreshVisibleDecorations();
  };

  // 同时监听文件系统变化和编辑器内文本变化，这样无论是保存后的文件变更，
  // 还是用户正在输入时的缓冲区内容变化，都能及时触发分析。
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{js,jsx,ts,tsx}");

  context.subscriptions.push(
    diagnosticCollection,
    highlightDecoration,
    watcher,
    vscode.commands.registerCommand("astWatchdog.rescanActiveFile", () => {
      const activeDocument = vscode.window.activeTextEditor?.document;
      if (activeDocument) {
        refreshDocument(activeDocument);
      }
    }),
    vscode.languages.registerHoverProvider(
        ["javascript", "javascriptreact", "typescript", "typescriptreact"],
      {
        provideHover(document, position) {
          // Hover 直接复用已有分析结果，避免每次鼠标移动都重新解析 AST。
          const issues = issuesByDocument.get(document.uri.toString()) ?? [];
          const matchedIssue = issues.find((issue) => issue.range.contains(position));
          if (!matchedIssue) {
            return undefined;
          }

          return new vscode.Hover(
            new vscode.MarkdownString(
              `**${matchedIssue.code}**\n\n${matchedIssue.hover}`
            ),
            matchedIssue.range
          );
        },
      }
    ),
    vscode.workspace.onDidOpenTextDocument(refreshDocument),
    vscode.workspace.onDidChangeTextDocument((event) => refreshDocument(event.document)),
    vscode.workspace.onDidSaveTextDocument(refreshDocument),
    vscode.workspace.onDidCloseTextDocument((document) => clearDocumentState(document.uri)),
    vscode.window.onDidChangeVisibleTextEditors(() => refreshVisibleDecorations()),
    watcher.onDidCreate((uri) => refreshOpenDocument(uri)),
    watcher.onDidChange((uri) => refreshOpenDocument(uri)),
    watcher.onDidDelete((uri) => clearDocumentState(uri))
  );

  vscode.workspace.textDocuments.forEach(refreshDocument);
  refreshVisibleDecorations();
}

export function deactivate(): void {
  diagnosticCollection.dispose();
  highlightDecoration.dispose();
  issuesByDocument.clear();
}

function initializeParsers(): void {
  const javascriptParser = new Parser();
  javascriptParser.setLanguage(JavaScript);

  const typescriptParser = new Parser();
  typescriptParser.setLanguage(TypeScript.typescript);

  const tsxParser = new Parser();
  tsxParser.setLanguage(TypeScript.tsx);

  parserByLanguage.set("javascript", javascriptParser);
  parserByLanguage.set("javascriptreact", javascriptParser);
  parserByLanguage.set("typescript", typescriptParser);
  parserByLanguage.set("typescriptreact", tsxParser);
}

function isSupportedDocument(document: vscode.TextDocument): document is vscode.TextDocument & {
  languageId: SupportedLanguage;
} {
  return SUPPORTED_LANGUAGES.has(document.languageId as SupportedLanguage);
}

function refreshOpenDocument(uri: vscode.Uri): void {
  const openDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString()
  );

  if (openDocument) {
    const activeEditor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === uri.toString()
    );

    if (activeEditor) {
      const issues = analyzeDocument(openDocument);
      issuesByDocument.set(uri.toString(), issues);
      diagnosticCollection.set(uri, issues.map(toDiagnostic));
      refreshVisibleDecorations();
    }
  }
}

function clearDocumentState(uri: vscode.Uri): void {
  issuesByDocument.delete(uri.toString());
  diagnosticCollection.delete(uri);
  refreshVisibleDecorations();
}

function refreshVisibleDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    const issues = issuesByDocument.get(editor.document.uri.toString()) ?? [];
    editor.setDecorations(
      highlightDecoration,
      issues.map((issue) => issue.range)
    );
  }
}

function analyzeDocument(document: vscode.TextDocument): AnalysisIssue[] {
  const parser = parserByLanguage.get(document.languageId as SupportedLanguage);
  if (!parser) {
    return [];
  }

  // 先把整个文档解析成语法树，再基于 AST 跑一组简单规则。
  const tree = parser.parse(document.getText());
  const issues: AnalysisIssue[] = [];

  walkTree(tree.rootNode, (node) => {
    if (node.type === "debugger_statement") {
      issues.push({
        range: toRange(document, node),
        severity: vscode.DiagnosticSeverity.Error,
        message: "Avoid committing debugger statements.",
        code: "ast-watchdog/debugger",
        hover: "This `debugger` statement was detected from the AST. Remove it or guard it before shipping.",
      });
      return;
    }

    if (node.type === "call_expression" && isConsoleLog(node)) {
      issues.push({
        range: toRange(document, node),
        severity: vscode.DiagnosticSeverity.Warning,
        message: "Console logging detected.",
        code: "ast-watchdog/console-log",
        hover: "This `console.log(...)` call was found via tree-sitter. Replace it with structured logging or remove it.",
      });
    }
  });

  return issues;
}

function walkTree(node: SyntaxNode, visit: (node: SyntaxNode) => void): void {
  visit(node);

  // 当前规则比较简单，用深度优先遍历就够了，控制流也更直观。
  for (const child of node.children) {
    walkTree(child, visit);
  }
}

function isConsoleLog(node: SyntaxNode): boolean {
  // 在 tree-sitter 里，`console.log(...)` 会被表示成一个 call_expression，
  // 它的 function 字段是 member_expression，且 object=console、property=log。
  const functionNode = node.childForFieldName("function");
  if (!functionNode || functionNode.type !== "member_expression") {
    return false;
  }

  const objectNode = functionNode.childForFieldName("object");
  const propertyNode = functionNode.childForFieldName("property");

  return objectNode?.text === "console" && propertyNode?.text === "log";
}

function toDiagnostic(issue: AnalysisIssue): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(issue.range, issue.message, issue.severity);
  diagnostic.source = "AST Watchdog";
  diagnostic.code = issue.code;
  return diagnostic;
}

function toRange(document: vscode.TextDocument, node: SyntaxNode): vscode.Range {
  // tree-sitter 给出的是偏移量，VS Code API 需要的是行列位置。
  return new vscode.Range(
    document.positionAt(node.startIndex),
    document.positionAt(node.endIndex)
  );
}
