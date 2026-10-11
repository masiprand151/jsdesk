export type JsdeskNodeKind =
  | "Window"
  | "Column"
  | "Row"
  | "View"
  | "Text"
  | "Button"
  | "TextInput"
  | "NavigationStack"
  | "Unsupported";

export type JsdeskPrimitive = string | number | boolean | null;

export type JsdeskValue =
  | JsdeskPrimitive
  | JsdeskValue[]
  | { [key: string]: JsdeskValue }
  | {
      kind: JsdeskNodeKind;
      props?: Record<string, JsdeskValue>;
      children?: JsdeskValue[];
      value?: JsdeskPrimitive;
    };

export interface JsdeskIRNode {
  kind: JsdeskNodeKind;
  props?: Record<string, JsdeskValue>;
  children?: JsdeskIRNode[];
  value?: JsdeskPrimitive;
}

export interface Diagnostic {
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  feature?: string;
  suggestion?: string;
}

export interface ParsedProgram {
  filePath: string;
  root: JsdeskIRNode;
  diagnostics: Diagnostic[];
}
