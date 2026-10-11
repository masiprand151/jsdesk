import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

import { ensureNode, normalizeNodeKind } from "./ir";
import type {
  Diagnostic,
  JsdeskIRNode,
  JsdeskValue,
  ParsedProgram,
} from "./types";

const supportedComponentNames = new Set([
  "Window",
  "Column",
  "Row",
  "View",
  "Text",
  "Button",
  "TextInput",
  "NavigationStack",
]);

function createDiagnostic(
  filePath: string,
  code: string,
  message: string,
  line: number,
  column: number,
  feature?: string,
  suggestion?: string,
): Diagnostic {
  return {
    code,
    message,
    file: path.relative(process.cwd(), filePath) || filePath,
    line,
    column,
    feature,
    suggestion,
  };
}

function parseArrowFunction(
  node: ts.ArrowFunction | ts.FunctionExpression,
  filePath: string,
  diagnostics: Diagnostic[],
) {
  const start = node.getStart();
  const line =
    ts.getLineAndCharacterOfPosition(node.getSourceFile(), start).line + 1;
  const column =
    ts.getLineAndCharacterOfPosition(node.getSourceFile(), start).character + 1;

  diagnostics.push(
    createDiagnostic(
      filePath,
      "JSK1001",
      `Unsupported callback syntax: ${node.getText()}`,
      line,
      column,
      "Callback function",
      "Use a supported function or event handler signature supported by Jsdesk.",
    ),
  );

  return {
    kind: "Unsupported",
    props: {},
  } as JsdeskIRNode;
}

function getMemberName(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : name.getText();
}

function parseActionExpression(
  expression: ts.Expression | undefined,
  filePath: string,
  diagnostics: Diagnostic[],
  functionMap: Map<string, ts.FunctionDeclaration>,
): JsdeskValue {
  if (!expression) {
    return "__event_handler__";
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    const body = expression.body;
    if (ts.isBlock(body)) {
      const returnStatement = body.statements.find(ts.isReturnStatement);
      if (returnStatement?.expression) {
        return parseActionExpression(
          returnStatement.expression,
          filePath,
          diagnostics,
          functionMap,
        );
      }
      return "__event_handler__";
    }

    if (body) {
      return parseActionExpression(body, filePath, diagnostics, functionMap);
    }

    return "__event_handler__";
  }

  if (ts.isCallExpression(expression)) {
    const callee = expression.expression;
    if (ts.isIdentifier(callee) && callee.text === "GoBack") {
      return { __jsdesk_action__: "goback" };
    }

    if (ts.isIdentifier(callee) && callee.text === "Navigate") {
      const routeArg = expression.arguments[0];
      const route =
        routeArg && ts.isStringLiteral(routeArg)
          ? routeArg.text
          : routeArg && ts.isNoSubstitutionTemplateLiteral(routeArg)
            ? routeArg.text
            : null;

      return route
        ? { __jsdesk_action__: "navigate", route }
        : "__event_handler__";
    }
  }

  if (ts.isIdentifier(expression) && functionMap.has(expression.text)) {
    return (
      resolveFunctionDeclaration(
        expression,
        functionMap,
        filePath,
        diagnostics,
      ) ?? "__event_handler__"
    );
  }

  return "__event_handler__";
}

function collectFunctionDeclarations(
  node: ts.Node,
  map: Map<string, ts.FunctionDeclaration>,
): void {
  if (ts.isFunctionDeclaration(node) && node.name) {
    map.set(node.name.text, node);
  }

  ts.forEachChild(node, (child) => {
    collectFunctionDeclarations(child, map);
  });
}

function resolveFunctionDeclaration(
  expression: ts.Identifier,
  functionMap: Map<string, ts.FunctionDeclaration>,
  filePath: string,
  diagnostics: Diagnostic[],
): JsdeskValue | null {
  const declaration = functionMap.get(expression.text);
  if (!declaration) {
    return expression.text;
  }

  const returnStatements =
    declaration.body?.statements.filter(ts.isReturnStatement) ?? [];
  for (const statement of returnStatements) {
    if (statement.expression) {
      return parseJsdeskExpression(
        statement.expression,
        filePath,
        diagnostics,
        functionMap,
      );
    }
  }

  return null;
}

function parseJsdeskExpression(
  expression: ts.Expression | undefined,
  filePath: string,
  diagnostics: Diagnostic[],
  functionMap: Map<string, ts.FunctionDeclaration> = new Map(),
): JsdeskValue {
  if (!expression) {
    return null;
  }

  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) =>
      parseJsdeskExpression(
        element as ts.Expression,
        filePath,
        diagnostics,
        functionMap,
      ),
    );
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const result: Record<string, JsdeskValue> = {};
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const propertyName = getMemberName(property.name);
        if (
          ts.isArrowFunction(property.initializer) ||
          ts.isFunctionExpression(property.initializer)
        ) {
          result[propertyName] = parseActionExpression(
            property.initializer,
            filePath,
            diagnostics,
            functionMap,
          );
          continue;
        }

        result[propertyName] = parseJsdeskExpression(
          property.initializer,
          filePath,
          diagnostics,
          functionMap,
        );
      }
    }
    return result;
  }

  if (ts.isCallExpression(expression)) {
    const calleeName = ts.isIdentifier(expression.expression)
      ? expression.expression.text
      : expression.expression.getText();
    if (supportedComponentNames.has(calleeName)) {
      const props =
        expression.arguments[0] &&
        ts.isObjectLiteralExpression(expression.arguments[0])
          ? parseJsdeskExpression(
              expression.arguments[0],
              filePath,
              diagnostics,
              functionMap,
            )
          : {};

      const node: JsdeskIRNode = {
        kind: normalizeNodeKind(calleeName),
        props: props as Record<string, JsdeskValue>,
      };

      const childEntries = Array.isArray(node.props?.children)
        ? node.props.children
            .map((child) => ensureNode(child as JsdeskValue))
            .filter((item): item is JsdeskIRNode => item != null)
        : [];

      if (childEntries.length > 0) {
        node.children = childEntries;
      }

      if (node.props && typeof node.props.body !== "undefined") {
        const bodyNode = ensureNode(node.props.body as JsdeskValue);
        if (bodyNode) {
          node.props.body = bodyNode as JsdeskValue;
        }
      }

      if (
        calleeName === "NavigationStack" &&
        node.props &&
        typeof node.props.routes === "object" &&
        node.props.routes != null
      ) {
        const routeMap = node.props.routes as Record<string, JsdeskValue>;
        const resolvedRoutes: Record<string, JsdeskValue> = {};

        for (const [routeKey, routeValue] of Object.entries(routeMap)) {
          if (typeof routeValue === "string" && functionMap.has(routeValue)) {
            const resolved = resolveFunctionDeclaration(
              { text: routeValue } as ts.Identifier,
              functionMap,
              filePath,
              diagnostics,
            );
            resolvedRoutes[routeKey] = resolved ?? routeValue;
            continue;
          }

          resolvedRoutes[routeKey] = routeValue;
        }

        node.props.routes = resolvedRoutes;
      }

      if (calleeName === "Text") {
        const value =
          typeof node.props?.value === "string" ? node.props.value : "";
        node.value = value;
      }

      if (calleeName === "Button") {
        const value =
          typeof node.props?.text === "string" ? node.props.text : "";
        node.value = value;
      }

      if (calleeName === "TextInput") {
        const value =
          typeof node.props?.value === "string" ? node.props.value : "";
        node.value = value;
      }

      return {
        kind: node.kind,
        props: node.props,
        children: node.children,
        value: node.value,
      };
    }

    const start = expression.getStart();
    const line =
      ts.getLineAndCharacterOfPosition(expression.getSourceFile(), start).line +
      1;
    const column =
      ts.getLineAndCharacterOfPosition(expression.getSourceFile(), start)
        .character + 1;

    diagnostics.push(
      createDiagnostic(
        filePath,
        "JSK1002",
        `Unsupported function call: ${calleeName}`,
        line,
        column,
        "Function call conversion",
        "Use a supported Jsdesk component or a supported property expression.",
      ),
    );

    return {
      kind: "Unsupported",
      props: {},
    };
  }

  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return "__event_handler__";
  }

  if (ts.isIdentifier(expression)) {
    return resolveFunctionDeclaration(
      expression,
      functionMap,
      filePath,
      diagnostics,
    );
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.getText();
  }

  const start = expression.getStart();
  const line =
    ts.getLineAndCharacterOfPosition(expression.getSourceFile(), start).line +
    1;
  const column =
    ts.getLineAndCharacterOfPosition(expression.getSourceFile(), start)
      .character + 1;

  diagnostics.push(
    createDiagnostic(
      filePath,
      "JSK1001",
      `Unsupported syntax: ${ts.SyntaxKind[expression.kind]}`,
      line,
      column,
      "Parser support",
      "Use a supported TSX subset for Jsdesk.",
    ),
  );

  return {
    kind: "Unsupported",
    props: {},
  };
}

function isDefaultExportedFunction(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) &&
    !!node.modifiers &&
    node.modifiers.some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword,
    )
  );
}

function findDefaultExportCall(
  node: ts.Node,
  filePath: string,
  diagnostics: Diagnostic[],
  functionMap: Map<string, ts.FunctionDeclaration> = new Map(),
): JsdeskIRNode | null {
  if (ts.isSourceFile(node)) {
    for (const statement of node.statements) {
      if (
        ts.isFunctionDeclaration(statement) &&
        isDefaultExportedFunction(statement)
      ) {
        const result = findDefaultExportCall(
          statement,
          filePath,
          diagnostics,
          functionMap,
        );
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  if (ts.isFunctionDeclaration(node) && isDefaultExportedFunction(node)) {
    for (const statement of node.body?.statements ?? []) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        const found = findDefaultExportCall(
          statement.expression,
          filePath,
          diagnostics,
          functionMap,
        );
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if (supportedComponentNames.has(name)) {
      const props =
        node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
          ? (parseJsdeskExpression(
              node.arguments[0],
              filePath,
              diagnostics,
              functionMap,
            ) as Record<string, JsdeskValue>)
          : {};
      return {
        kind: normalizeNodeKind(name),
        props,
      };
    }
  }

  if (
    ts.isReturnStatement(node) &&
    node.expression &&
    ts.isCallExpression(node.expression)
  ) {
    const found = findDefaultExportCall(
      node.expression,
      filePath,
      diagnostics,
      functionMap,
    );
    if (found) {
      return found;
    }
  }

  let result: JsdeskIRNode | null = null;
  ts.forEachChild(node, (child) => {
    if (!result) {
      result = findDefaultExportCall(child, filePath, diagnostics, functionMap);
    }
  });

  return result;
}

export function parseFile(filePath: string): ParsedProgram {
  const diagnostics: Diagnostic[] = [];
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const functionMap = new Map<string, ts.FunctionDeclaration>();
  collectFunctionDeclarations(sourceFile, functionMap);

  const root = findDefaultExportCall(
    sourceFile,
    filePath,
    diagnostics,
    functionMap,
  ) ?? {
    kind: "Unsupported",
    props: {},
  };

  const normalized = ensureNode(root) ?? {
    kind: "Unsupported",
    props: {},
  };

  if (normalized.kind === "Unsupported") {
    diagnostics.push(
      createDiagnostic(
        filePath,
        "JSK1000",
        "No supported Jsdesk component tree was found in the default export.",
        1,
        1,
        "TSX parsing",
        "Return a supported Window/Column/Text/Button component tree from the default export.",
      ),
    );
  }

  return {
    filePath,
    root: normalized,
    diagnostics,
  };
}
