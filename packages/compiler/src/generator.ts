import * as fs from "fs";
import * as path from "path";

import type { Diagnostic, JsdeskIRNode, JsdeskValue } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toStyleValue(value: JsdeskValue | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  if (value == null) {
    return "";
  }

  return "";
}

function toThickness(value: JsdeskValue): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value !== "string") {
    return toStyleValue(value);
  }

  const parts = value.trim().replace(/px/g, "").split(/\s+/);
  if (
    parts.length > 4 ||
    parts.some((part) => !Number.isFinite(Number(part)))
  ) {
    return value;
  }

  if (parts.length === 1) {
    return `${parts[0]},${parts[0]},${parts[0]},${parts[0]}`;
  }
  if (parts.length === 2) {
    return `${parts[1]},${parts[0]},${parts[1]},${parts[0]}`;
  }
  if (parts.length === 3) {
    return `${parts[1]},${parts[0]},${parts[1]},${parts[2]}`;
  }

  return `${parts[3]},${parts[0]},${parts[1]},${parts[2]}`;
}

function getNodeStyle(node: JsdeskIRNode): Record<string, JsdeskValue> {
  const style = node.props?.style;
  return style && typeof style === "object" && !Array.isArray(style)
    ? (style as Record<string, JsdeskValue>)
    : {};
}

function styleAttributes(
  style: Record<string, JsdeskValue>,
  target: "window" | "panel" | "border" | "text" | "button" | "input",
  defaults: Record<string, string> = {},
): string {
  const attributes = { ...defaults };
  const positions: Record<string, { horizontal: string; vertical: string }> = {
    "top-left": { horizontal: "Left", vertical: "Top" },
    top: { horizontal: "Center", vertical: "Top" },
    "top-center": { horizontal: "Center", vertical: "Top" },
    "top-right": { horizontal: "Right", vertical: "Top" },
    left: { horizontal: "Left", vertical: "Center" },
    "center-left": { horizontal: "Left", vertical: "Center" },
    center: { horizontal: "Center", vertical: "Center" },
    "center-right": { horizontal: "Right", vertical: "Center" },
    right: { horizontal: "Right", vertical: "Center" },
    "bottom-left": { horizontal: "Left", vertical: "Bottom" },
    bottom: { horizontal: "Center", vertical: "Bottom" },
    "bottom-center": { horizontal: "Center", vertical: "Bottom" },
    "bottom-right": { horizontal: "Right", vertical: "Bottom" },
  };
  const mappings: Record<string, string> = {
    backgroundColor: "Background",
    background: "Background",
    borderColor: "BorderBrush",
    borderWidth: "BorderThickness",
    borderRadius: "CornerRadius",
    color: "Foreground",
    fontFamily: "FontFamily",
    fontSize: "FontSize",
    fontWeight: "FontWeight",
    height: "Height",
    horizontalAlignment: "HorizontalAlignment",
    margin: "Margin",
    maxHeight: "MaxHeight",
    maxWidth: "MaxWidth",
    minHeight: "MinHeight",
    minWidth: "MinWidth",
    opacity: "Opacity",
    padding: "Padding",
    textAlign: "TextAlignment",
    verticalAlignment: "VerticalAlignment",
    width: "Width",
  };

  const position = style.position;
  if (typeof position === "string") {
    const normalizedPosition = position
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const alignment = positions[normalizedPosition];
    if (alignment) {
      attributes.HorizontalAlignment = alignment.horizontal;
      attributes.VerticalAlignment = alignment.vertical;
    }
  }

  for (const [property, attribute] of Object.entries(mappings)) {
    const value = style[property];
    if (value == null) {
      continue;
    }
    if (property === "color" && !["text", "button", "input"].includes(target)) {
      continue;
    }
    if (property === "backgroundColor" || property === "background") {
      if (!["window", "panel", "border", "button", "input"].includes(target)) {
        continue;
      }
    }
    if (
      property === "padding" &&
      !["border", "button", "input"].includes(target)
    ) {
      continue;
    }
    if (property === "borderColor" || property === "borderWidth") {
      if (!["border", "button", "input"].includes(target)) {
        continue;
      }
    }
    if (property === "borderRadius" && target !== "border") {
      continue;
    }
    if (property === "textAlign" && target !== "text") {
      continue;
    }
    if (
      ["fontFamily", "fontSize", "fontWeight"].includes(property) &&
      !["window", "text", "button", "input"].includes(target)
    ) {
      continue;
    }

    let formattedValue = toStyleValue(value);
    if (["margin", "padding", "borderWidth"].includes(property)) {
      formattedValue = toThickness(value);
    } else if (property === "borderRadius" && typeof value === "string") {
      formattedValue = toThickness(value);
    } else if (property === "fontWeight" && typeof value === "string") {
      const weight = value.toLowerCase();
      const cssWeights: Record<string, string> = {
        "100": "Thin",
        "200": "ExtraLight",
        "300": "Light",
        "400": "Normal",
        "500": "Medium",
        "600": "SemiBold",
        "700": "Bold",
        "800": "ExtraBold",
        "900": "Black",
        semibold: "SemiBold",
      };
      formattedValue = cssWeights[weight] ?? value;
    }
    attributes[attribute] = formattedValue;
  }

  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(" ");
}

function getTextValue(node: JsdeskIRNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }

  const propsValue = node.props?.value;
  if (typeof propsValue === "string") {
    return propsValue;
  }

  if (typeof node.props?.text === "string") {
    return node.props.text;
  }

  return "";
}

function collectButtonActions(
  node: JsdeskIRNode,
): Array<{ type: "navigate" | "goback" | "debug"; route?: string }> {
  const actions: Array<{
    type: "navigate" | "goback" | "debug";
    route?: string;
  }> = [];

  if (node.kind === "Button") {
    const action = node.props?.onPress;
    if (typeof action === "object" && action && "__jsdesk_action__" in action) {
      const type = action.__jsdesk_action__;
      if (type === "navigate") {
        actions.push({ type: "navigate", route: String(action.route ?? "/") });
      } else if (type === "goback") {
        actions.push({ type: "goback" });
      } else {
        actions.push({ type: "debug" });
      }
    } else {
      actions.push({ type: "debug" });
    }
    return actions;
  }

  if (node.kind === "NavigationStack") {
    const routeMap =
      (node.props?.routes as Record<string, unknown> | undefined) ?? {};
    for (const routeValue of Object.values(routeMap)) {
      if (
        routeValue &&
        typeof routeValue === "object" &&
        "kind" in routeValue
      ) {
        actions.push(...collectButtonActions(routeValue as JsdeskIRNode));
      }
    }
    return actions;
  }

  if (node.kind === "Window") {
    const body = node.props?.body as JsdeskIRNode | undefined;
    if (body) {
      actions.push(...collectButtonActions(body));
    }
    return actions;
  }

  for (const child of node.children ?? []) {
    actions.push(...collectButtonActions(child));
  }

  return actions;
}

function renderChildNode(
  node: JsdeskIRNode,
  eventCounter: { value: number },
  layoutMargin?: string,
): string {
  switch (node.kind) {
    case "Window": {
      const body = node.props?.body as JsdeskIRNode | undefined;
      const inner = body ? renderChildNode(body, eventCounter) : "";
      return `<Grid>${inner}</Grid>`;
    }
    case "Column": {
      const items = node.children ?? [];
      const spacing = Number(node.props?.spacing ?? 0);
      const children = items
        .map((child, index) =>
          renderChildNode(
            child,
            eventCounter,
            index < items.length - 1 && spacing > 0
              ? `0,0,0,${spacing}`
              : spacing > 0
                ? "0"
                : undefined,
          ),
        )
        .join("\n");
      const style = getNodeStyle(node);
      const hasBorder = [
        "padding",
        "borderColor",
        "borderWidth",
        "borderRadius",
      ].some((property) => style[property] != null);
      const panel = `<StackPanel Orientation="Vertical"${
        hasBorder
          ? ""
          : ` ${styleAttributes(style, "panel", layoutMargin ? { Margin: layoutMargin } : {})}`
      }>${children}</StackPanel>`;
      return hasBorder
        ? `<Border ${styleAttributes(style, "border", layoutMargin ? { Margin: layoutMargin } : {})}>${panel}</Border>`
        : panel;
    }
    case "Row": {
      const items = node.children ?? [];
      const spacing = Number(node.props?.spacing ?? 0);
      const children = items
        .map((child, index) =>
          renderChildNode(
            child,
            eventCounter,
            index < items.length - 1 && spacing > 0
              ? `0,0,${spacing},0`
              : spacing > 0
                ? "0"
                : undefined,
          ),
        )
        .join("\n");
      const style = getNodeStyle(node);
      const hasBorder = [
        "padding",
        "borderColor",
        "borderWidth",
        "borderRadius",
      ].some((property) => style[property] != null);
      const panel = `<StackPanel Orientation="Horizontal"${
        hasBorder
          ? ""
          : ` ${styleAttributes(style, "panel", layoutMargin ? { Margin: layoutMargin } : {})}`
      }>${children}</StackPanel>`;
      return hasBorder
        ? `<Border ${styleAttributes(style, "border", layoutMargin ? { Margin: layoutMargin } : {})}>${panel}</Border>`
        : panel;
    }
    case "View": {
      const children = (node.children ?? [])
        .map((child) => renderChildNode(child, eventCounter))
        .join("\n");
      const style = getNodeStyle(node);
      return `<Border ${styleAttributes(style, "border", layoutMargin ? { Margin: layoutMargin } : {})}>${children}</Border>`;
    }
    case "Text": {
      const value = escapeXml(getTextValue(node));
      const style = getNodeStyle(node);
      const defaults = {
        FontSize: "28",
        FontWeight: "Bold",
        Margin: layoutMargin ?? "0,0,0,12",
      };
      return `<TextBlock Text="${value}" ${styleAttributes(style, "text", defaults)} />`;
    }
    case "Button": {
      eventCounter.value += 1;
      const text = escapeXml(getTextValue(node));
      const eventName = `Button_Click_${eventCounter.value}`;
      const style = getNodeStyle(node);
      return `<Button Content="${text}" ${styleAttributes(style, "button", {
        Margin: layoutMargin ?? "0,0,0,8",
      })} Click="${eventName}" />`;
    }
    case "TextInput": {
      const value = escapeXml(String(getTextValue(node) ?? ""));
      const placeholder = escapeXml(
        String((node.props?.placeholder as string | undefined) ?? ""),
      );
      const style = getNodeStyle(node);
      return `<TextBox Text="${value}" ${styleAttributes(style, "input", {
        Margin: layoutMargin ?? "0,0,0,8",
      })} TextWrapping="Wrap" />`;
    }
    case "NavigationStack": {
      const routeMap =
        (node.props?.routes as Record<string, unknown> | undefined) ?? {};
      const entries = Object.entries(routeMap);

      const routeContent = entries
        .map(([routePath, routeValue], index) => {
          const resolvedValue =
            typeof routeValue === "object" && routeValue && "kind" in routeValue
              ? (routeValue as JsdeskIRNode)
              : null;
          const page = resolvedValue
            ? renderChildNode(resolvedValue, eventCounter)
            : `<TextBlock Text="${escapeXml(routePath)}" Margin="0,0,0,8" />`;
          const visible = index === 0 ? "Visible" : "Collapsed";
          return `<Border x:Name="Route_${index + 1}" Visibility="${visible}">${page}</Border>`;
        })
        .join("\n");

      return `<StackPanel HorizontalAlignment="Center" VerticalAlignment="Center">
        <Grid>
          ${routeContent}
        </Grid>
      </StackPanel>`;
    }
    default:
      return "";
  }
}

function findNavigationRoutes(node: JsdeskIRNode | undefined): string[] {
  if (!node) {
    return [];
  }

  if (node.kind === "NavigationStack") {
    return Object.keys(
      (node.props?.routes as Record<string, unknown> | undefined) ?? {},
    );
  }

  if (node.kind === "Window") {
    return findNavigationRoutes(node.props?.body as JsdeskIRNode | undefined);
  }

  return [];
}

function renderMainWindowCode(
  eventCount: number,
  navigationRoutes: Array<string> = [],
  buttonActions: Array<{
    type: "navigate" | "goback" | "debug";
    route?: string;
  }> = [],
): string {
  const methods: string[] = [];

  for (let i = 0; i < eventCount; i += 1) {
    const action = buttonActions[i] ?? { type: "debug" };

    if (action.type === "navigate") {
      methods.push(`
        private void Button_Click_${i + 1}(object sender, System.Windows.RoutedEventArgs e)
        {
            NavigateTo("${action.route ?? "/"}");
        }
`);
      continue;
    }

    if (action.type === "goback") {
      methods.push(`
        private void Button_Click_${i + 1}(object sender, System.Windows.RoutedEventArgs e)
        {
            GoBack();
        }
`);
      continue;
    }

    methods.push(`
        private void Button_Click_${i + 1}(object sender, System.Windows.RoutedEventArgs e)
        {
            System.Diagnostics.Debug.WriteLine("Button ${i + 1} clicked");
        }
`);
  }

  const navSetup =
    navigationRoutes.length > 0
      ? `
        private string _currentRoute = "${navigationRoutes[0]}";
        private readonly System.Collections.Generic.List<string> _routeHistory = new() { "${navigationRoutes[0]}" };
`
      : "";

  if (navigationRoutes.length > 0) {
    methods.push(`
        private void ApplyRoute(string route)
        {
            if (string.IsNullOrWhiteSpace(route))
            {
                route = "/";
            }

            _currentRoute = route;

            ${navigationRoutes
              .map(
                (routeName, index) =>
                  `Route_${index + 1}.Visibility = route == "${routeName}" ? Visibility.Visible : Visibility.Collapsed;`,
              )
              .join("\n            ")}
        }
`);

    methods.push(`
        private void NavigateTo(string route)
        {
            if (string.IsNullOrWhiteSpace(route))
            {
                route = "/";
            }

            _routeHistory.Add(route);
            ApplyRoute(route);
        }
`);

    methods.push(`
        private void GoBack()
        {
            if (_routeHistory.Count > 1)
            {
                _routeHistory.RemoveAt(_routeHistory.Count - 1);
                _currentRoute = _routeHistory[^1];
                ApplyRoute(_currentRoute);
                return;
            }

            _currentRoute = "/";
            ApplyRoute(_currentRoute);
        }
`);
  }

  return `using System.Windows;

namespace Jsdesk.Generated;

public partial class MainWindow : Window
{
    ${navSetup}

    public MainWindow()
    {
        InitializeComponent();
    }

    ${methods.join("\n")}
}`;
}

function renderAppCode(): string {
  return `using System.Windows;

namespace Jsdesk.Generated;

public partial class App : Application
{
    public App()
    {
        InitializeComponent();
    }
}`;
}

export function generateProject(
  outputDir: string,
  rootNode: JsdeskIRNode,
): { outputFiles: string[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const eventCounter = { value: 0 };
  const navigationRoutes = findNavigationRoutes(rootNode);
  const buttonActions = collectButtonActions(rootNode);
  const xaml = renderChildNode(rootNode, eventCounter);
  const csproj = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>Jsdesk.Generated</RootNamespace>
    <AssemblyName>Jsdesk.Generated</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\\..\\runtime\\Jsdesk.Runtime\\Jsdesk.Runtime.csproj" />
  </ItemGroup>
</Project>
`;

  const title = String(
    (rootNode.props?.title as string | undefined) ?? "Jsdesk App",
  );
  const width = String((rootNode.props?.width as number | undefined) ?? 1000);
  const height = String((rootNode.props?.height as number | undefined) ?? 700);
  const fullscreen = Boolean(
    rootNode.props?.fullscreen ?? rootNode.props?.fulscreen ?? false,
  );
  const frame = rootNode.props?.frame !== false;
  const resize = rootNode.props?.resize !== false;
  const alwaysOnTop = Boolean(rootNode.props?.alwaysOnTop ?? false);
  const windowState = fullscreen ? "Maximized" : "Normal";
  const windowStyle = frame ? "SingleBorderWindow" : "None";
  const resizeMode = resize ? "CanResize" : "NoResize";

  const appXaml = `
<Application x:Class="Jsdesk.Generated.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             StartupUri="MainWindow.xaml">
    <Application.Resources />
</Application>
`;

  const mainWindowXaml = `
<Window x:Class="Jsdesk.Generated.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="${escapeXml(title)}"
        Width="${width}"
        Height="${height}"
        WindowState="${windowState}"
        WindowStyle="${windowStyle}"
        ResizeMode="${resizeMode}"
        Topmost="${alwaysOnTop ? "True" : "False"}"
      ${styleAttributes(getNodeStyle(rootNode), "window")}
        WindowStartupLocation="CenterScreen">
    <Window.Resources>
      <Style TargetType="{x:Type Button}">
        <Setter Property="BorderThickness" Value="0" />
        <Setter Property="Padding" Value="18,12" />
        <Setter Property="FontWeight" Value="SemiBold" />
        <Setter Property="Cursor" Value="Hand" />
        <Setter Property="Template">
          <Setter.Value>
            <ControlTemplate TargetType="{x:Type Button}">
              <Border x:Name="ButtonSurface"
                  Background="{TemplateBinding Background}"
                  BorderBrush="{TemplateBinding BorderBrush}"
                  BorderThickness="{TemplateBinding BorderThickness}"
                  CornerRadius="10">
                <ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}"
                          VerticalAlignment="{TemplateBinding VerticalContentAlignment}"
                          Margin="{TemplateBinding Padding}"
                          RecognizesAccessKey="True" />
              </Border>
              <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="True">
                  <Setter TargetName="ButtonSurface" Property="Opacity" Value="0.86" />
                </Trigger>
                <Trigger Property="IsEnabled" Value="False">
                  <Setter TargetName="ButtonSurface" Property="Opacity" Value="0.45" />
                </Trigger>
              </ControlTemplate.Triggers>
            </ControlTemplate>
          </Setter.Value>
        </Setter>
      </Style>
    </Window.Resources>
    ${xaml}
</Window>
`;

  const appCode = renderAppCode();
  const mainWindowCode = renderMainWindowCode(
    eventCounter.value,
    navigationRoutes,
    buttonActions,
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const files = [
    { file: path.join(outputDir, "Jsdesk.Generated.csproj"), content: csproj },
    { file: path.join(outputDir, "App.xaml"), content: appXaml },
    { file: path.join(outputDir, "App.xaml.cs"), content: appCode },
    { file: path.join(outputDir, "MainWindow.xaml"), content: mainWindowXaml },
    {
      file: path.join(outputDir, "MainWindow.xaml.cs"),
      content: mainWindowCode,
    },
  ];

  for (const file of files) {
    fs.writeFileSync(file.file, file.content.trimStart(), "utf8");
  }

  return {
    outputFiles: files.map((file) => file.file),
    diagnostics,
  };
}
