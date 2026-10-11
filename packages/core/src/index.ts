export type JsdeskPosition =
  | "top-left"
  | "top"
  | "top-center"
  | "top-right"
  | "left"
  | "center-left"
  | "center"
  | "center-right"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-center"
  | "bottom-right";

export type JsdeskStyle = Record<
  string,
  string | number | boolean | null | undefined
> & {
  position?: JsdeskPosition;
};

export type JsdeskNode = {
  kind: string;
  props?: Record<string, unknown>;
  value?: string | number | boolean | null;
  children?: JsdeskNode[];
  style?: JsdeskStyle;
};

export type WindowProps = {
  title?: string;
  width?: number;
  height?: number;
  fullscreen?: boolean;
  fulscreen?: boolean;
  frame?: boolean;
  resize?: boolean;
  alwaysOnTop?: boolean;
  body?: JsdeskNode;
  children?: JsdeskNode[];
  style?: JsdeskStyle;
};

export type TextProps = {
  value: string;
  style?: JsdeskStyle;
};

export type ButtonProps = {
  text: string;
  onPress?: () => void;
  style?: JsdeskStyle;
};

export type ColumnProps = {
  spacing?: number;
  padding?: number;
  children?: JsdeskNode[];
  style?: JsdeskStyle;
};

export type ViewProps = {
  children?: JsdeskNode[];
  style?: JsdeskStyle;
};

export type RowProps = {
  spacing?: number;
  padding?: number;
  children?: JsdeskNode[];
  style?: JsdeskStyle;
};

export type TextInputProps = {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  style?: JsdeskStyle;
};

export type NavigationStackProps = {
  initialRoute?: string;
  routes?: Record<string, unknown>;
  style?: JsdeskStyle;
};

export type NavigationParams = Record<string, unknown>;

export function View(props: ViewProps): JsdeskNode {
  return {
    kind: "View",
    props,
    children: props.children ?? [],
  };
}

export function Row(props: RowProps): JsdeskNode {
  return {
    kind: "Row",
    props,
    children: props.children ?? [],
  };
}

export function Column(props: ColumnProps): JsdeskNode {
  return {
    kind: "Column",
    props,
    children: props.children ?? [],
  };
}

export function Window(props: WindowProps): JsdeskNode {
  return {
    kind: "Window",
    props,
    children: props.children ?? [],
  };
}

export function Text(props: TextProps): JsdeskNode {
  return {
    kind: "Text",
    props,
    value: props.value,
  };
}

export function Button(props: ButtonProps): JsdeskNode {
  return {
    kind: "Button",
    props,
    value: props.text,
  };
}

export function TextInput(props: TextInputProps): JsdeskNode {
  return {
    kind: "TextInput",
    props,
    value: props.value ?? "",
  };
}

export function NavigationStack(props: NavigationStackProps): JsdeskNode {
  return {
    kind: "NavigationStack",
    props,
  };
}

const getNavigationState = () => {
  const shell = globalThis as typeof globalThis & {
    __jsdesk_current_route?: string;
    __jsdesk_nav_params?: NavigationParams;
    __jsdesk_route_history?: string[];
    __jsdesk_can_go_back?: boolean;
  };

  shell.__jsdesk_current_route ??= "/";
  shell.__jsdesk_nav_params ??= {};
  shell.__jsdesk_route_history ??= [shell.__jsdesk_current_route];
  shell.__jsdesk_can_go_back ??= shell.__jsdesk_route_history.length > 1;

  return shell;
};

export const Navigation = {
  params: (): NavigationParams =>
    getNavigationState().__jsdesk_nav_params ?? {},
  currentRoute: (): string =>
    getNavigationState().__jsdesk_current_route ?? "/",
  history: (): string[] => [
    ...(getNavigationState().__jsdesk_route_history ?? ["/"]),
  ],
  canGoBack: (): boolean => {
    const shell = getNavigationState();
    return Boolean(
      shell.__jsdesk_route_history && shell.__jsdesk_route_history.length > 1,
    );
  },
  reset: (path: string, params?: NavigationParams) => {
    const shell = getNavigationState();
    shell.__jsdesk_route_history = [path];
    shell.__jsdesk_current_route = path;
    shell.__jsdesk_nav_params = params ?? {};
    shell.__jsdesk_can_go_back = false;
  },
  replace: (path: string, params?: NavigationParams) => {
    const shell = getNavigationState();
    const history = shell.__jsdesk_route_history ?? ["/"];
    const next = history.length > 0 ? [...history.slice(0, -1), path] : [path];
    shell.__jsdesk_route_history = next;
    shell.__jsdesk_current_route = path;
    shell.__jsdesk_nav_params = params ?? {};
    shell.__jsdesk_can_go_back = next.length > 1;
  },
};

export function Navigate(path: string, params?: NavigationParams): void {
  const shell = getNavigationState();
  const history = shell.__jsdesk_route_history ?? [
    shell.__jsdesk_current_route ?? "/",
  ];

  if (history.length === 0 || history[history.length - 1] !== path) {
    history.push(path);
  }

  shell.__jsdesk_route_history = history;
  shell.__jsdesk_current_route = path;
  shell.__jsdesk_nav_params = params ?? {};
  shell.__jsdesk_can_go_back = history.length > 1;
}

export function GoBack(): void {
  const shell = getNavigationState();
  const history = shell.__jsdesk_route_history ?? [
    shell.__jsdesk_current_route ?? "/",
  ];

  if (history.length > 1) {
    history.pop();
    shell.__jsdesk_route_history = history;
    shell.__jsdesk_current_route = history[history.length - 1] ?? "/";
    shell.__jsdesk_can_go_back = history.length > 1;
    return;
  }

  shell.__jsdesk_current_route = "/";
  shell.__jsdesk_can_go_back = false;
}

export const Application = {
  start: (_app: unknown) => {
    return _app;
  },
};
