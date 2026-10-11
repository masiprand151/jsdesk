import type {
  JsdeskIRNode,
  JsdeskNodeKind,
  JsdeskPrimitive,
  JsdeskValue,
} from "./types";

export function ensureNode(
  value: JsdeskValue | undefined,
): JsdeskIRNode | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  if ("kind" in value && typeof value.kind === "string") {
    const nodeValue = value as JsdeskIRNode;
    const rawProps = nodeValue.props ?? {};
    const normalizedProps: Record<string, JsdeskValue> = {};

    for (const [key, propValue] of Object.entries(rawProps)) {
      if (key === "children" && Array.isArray(propValue)) {
        normalizedProps[key] = propValue
          .map((child) => ensureNode(child as JsdeskValue) ?? child)
          .filter((child) => child != null);
        continue;
      }

      if (key === "body") {
        const bodyNode = ensureNode(propValue as JsdeskValue);
        normalizedProps[key] = bodyNode ?? propValue;
        continue;
      }

      normalizedProps[key] = propValue;
    }

    const childValues = Array.isArray(nodeValue.children)
      ? nodeValue.children
      : Array.isArray(normalizedProps.children)
        ? normalizedProps.children
        : [];

    return {
      kind: (nodeValue.kind as JsdeskNodeKind) ?? "Unsupported",
      props: normalizedProps,
      children: childValues
        .map((child) => ensureNode(child as JsdeskValue))
        .filter((item): item is JsdeskIRNode => item != null),
      value: nodeValue.value as JsdeskPrimitive | undefined,
    };
  }

  return null;
}

export function normalizeNodeKind(name: string): JsdeskNodeKind {
  switch (name) {
    case "Window":
      return "Window";
    case "Column":
      return "Column";
    case "Row":
      return "Row";
    case "View":
      return "View";
    case "Text":
      return "Text";
    case "Button":
      return "Button";
    case "TextInput":
      return "TextInput";
    case "NavigationStack":
      return "NavigationStack";
    default:
      return "Unsupported";
  }
}
