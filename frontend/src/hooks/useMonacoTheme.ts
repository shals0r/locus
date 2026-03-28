import { useEffect, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";

/**
 * Registers the "locus-dark" Monaco editor theme once.
 * Returns the theme name to use in <Editor theme={...} />.
 */
export function useMonacoTheme(): string {
  const monaco = useMonaco();
  const registered = useRef(false);

  useEffect(() => {
    if (!monaco || registered.current) return;
    registered.current = true;

    monaco.editor.defineTheme("locus-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "565f89", fontStyle: "italic" },
        { token: "keyword", foreground: "bb9af7" },
        { token: "string", foreground: "9ece6a" },
        { token: "number", foreground: "ff9e64" },
        { token: "regexp", foreground: "b4f9f8" },
        { token: "type", foreground: "2ac3de" },
        { token: "type.identifier", foreground: "2ac3de" },
        { token: "delimiter", foreground: "89ddff" },
        { token: "delimiter.bracket", foreground: "89ddff" },
        { token: "tag", foreground: "f7768e" },
        { token: "attribute.name", foreground: "bb9af7" },
        { token: "attribute.value", foreground: "9ece6a" },
        { token: "variable", foreground: "c0caf5" },
        { token: "variable.predefined", foreground: "7dcfff" },
        { token: "constant", foreground: "ff9e64" },
        { token: "function", foreground: "7aa2f7" },
        { token: "operator", foreground: "89ddff" },
        { token: "namespace", foreground: "2ac3de" },
      ],
      colors: {
        "editor.background": "#1a1b26",
        "editor.foreground": "#c0caf5",
        "editor.selectionBackground": "#283457",
        "editor.lineHighlightBackground": "#1e2030",
        "editorCursor.foreground": "#c0caf5",
        "editorWhitespace.foreground": "#3b4261",
        "editorIndentGuide.background": "#292e42",
        "editorIndentGuide.activeBackground": "#3b4261",
        "editor.selectionHighlightBackground": "#28345755",
        "editorLineNumber.foreground": "#3b4261",
        "editorLineNumber.activeForeground": "#737aa2",
        "editorBracketMatch.background": "#28345755",
        "editorBracketMatch.border": "#7aa2f7",
        "editorGutter.background": "#1a1b26",
        "minimap.background": "#1a1b26",
        "scrollbarSlider.background": "#292e4280",
        "scrollbarSlider.hoverBackground": "#3b4261a0",
        "scrollbarSlider.activeBackground": "#3b4261",
        "editorOverviewRuler.border": "#1a1b26",
        "editor.findMatchBackground": "#3d59a1aa",
        "editor.findMatchHighlightBackground": "#3d59a155",
        "editorWidget.background": "#1a1b26",
        "editorWidget.border": "#292e42",
        "input.background": "#1a1b26",
        "input.foreground": "#c0caf5",
        "input.border": "#3b4261",
        "dropdown.background": "#1a1b26",
        "dropdown.foreground": "#c0caf5",
        "dropdown.border": "#3b4261",
        "list.activeSelectionBackground": "#283457",
        "list.hoverBackground": "#1e2030",
      },
    });
  }, [monaco]);

  return "locus-dark";
}
