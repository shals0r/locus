import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { useMonacoTheme } from "../../hooks/useMonacoTheme";
import {
  useReadFile,
  useWriteFile,
  useFileStat,
} from "../../hooks/useFileOperations";
import { useEditorStore } from "../../stores/editorStore";

// Configure monaco workers (prevents main-thread fallback that freezes UI)
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// Configure monaco-editor to load locally (no CDN)
loader.config({ monaco });

interface CodeEditorProps {
  tabId: string;
  machineId: string;
  repoPath: string;
  filePath: string;
}

export function CodeEditor({
  tabId,
  machineId,
  repoPath,
  filePath,
}: CodeEditorProps) {
  const themeName = useMonacoTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [externalChange, setExternalChange] = useState(false);

  // Store selectors
  const setContent = useEditorStore((s) => s.setContent);
  const setOriginal = useEditorStore((s) => s.setOriginal);
  const getOriginal = useEditorStore((s) => s.getOriginal);
  const markDirty = useEditorStore((s) => s.markDirty);
  const markClean = useEditorStore((s) => s.markClean);
  const isDirty = useEditorStore((s) => s.isDirty);

  // File operations
  const {
    data: fileData,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadFile(machineId, filePath);
  const writeFile = useWriteFile();
  const { data: stat } = useFileStat(machineId, filePath);

  // Track the mtime we loaded
  const loadedMtimeRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // On initial file load, store original content
  useEffect(() => {
    if (!fileData || initializedRef.current) return;
    initializedRef.current = true;
    setOriginal(tabId, fileData.content);
    setContent(tabId, fileData.content);
    loadedMtimeRef.current = fileData.mtime;
  }, [fileData, tabId, setOriginal, setContent]);

  // External change detection via mtime polling
  useEffect(() => {
    if (!stat || !loadedMtimeRef.current) return;
    if (stat.mtime !== loadedMtimeRef.current) {
      if (!isDirty(tabId)) {
        // Editor is clean -- silently reload
        void refetch().then((result) => {
          if (result.data) {
            const content = result.data.content;
            setOriginal(tabId, content);
            setContent(tabId, content);
            loadedMtimeRef.current = result.data.mtime;
            // Update editor content directly
            const editor = editorRef.current;
            if (editor && editor.getValue() !== content) {
              editor.setValue(content);
            }
          }
        });
      } else {
        // Editor is dirty -- show notification
        setExternalChange(true);
      }
    }
  }, [stat, tabId, isDirty, refetch, setOriginal, setContent]);

  // Save handler
  const handleSave = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const value = editor.getValue();
    writeFile.mutate(
      { machineId, filePath, content: value, repoPath },
      {
        onSuccess: () => {
          markClean(tabId);
          setOriginal(tabId, value);
          loadedMtimeRef.current = new Date().toISOString();
          setExternalChange(false);
        },
      },
    );
  }, [machineId, filePath, repoPath, tabId, writeFile, markClean, setOriginal]);

  // Editor mount handler
  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;

      // Register Ctrl+S / Cmd+S save command
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          handleSave();
        },
      );

      // Focus the editor
      editor.focus();
    },
    [handleSave],
  );

  // Content change handler
  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;
      setContent(tabId, value);
      const original = getOriginal(tabId);
      if (original !== undefined && value !== original) {
        markDirty(tabId);
      } else {
        markClean(tabId);
      }
    },
    [tabId, setContent, getOriginal, markDirty, markClean],
  );

  // Reload from disk
  const handleReload = useCallback(() => {
    void refetch().then((result) => {
      if (result.data) {
        const content = result.data.content;
        setOriginal(tabId, content);
        setContent(tabId, content);
        markClean(tabId);
        loadedMtimeRef.current = result.data.mtime;
        setExternalChange(false);
        const editor = editorRef.current;
        if (editor && editor.getValue() !== content) {
          editor.setValue(content);
        }
      }
    });
  }, [refetch, tabId, setOriginal, setContent, markClean]);

  // Keep mine (dismiss external change notification)
  const handleKeepMine = useCallback(() => {
    if (stat) {
      loadedMtimeRef.current = stat.mtime;
    }
    setExternalChange(false);
  }, [stat]);

  // Infer language from file extension
  const language = fileData?.language ?? inferLanguage(filePath);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-dominant">
        <div className="flex items-center gap-2 text-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading file...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center bg-dominant">
        <div className="text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-danger" />
          <p className="text-sm text-danger mb-2">Failed to load file</p>
          <p className="text-xs text-muted mb-3 max-w-sm">
            {error?.message || "Unknown error"}
          </p>
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 mx-auto rounded bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* External change notification bar */}
      {externalChange && (
        <div className="flex items-center gap-2 bg-warning/10 border-b border-warning/30 px-3 py-1.5">
          <AlertTriangle size={12} className="text-warning shrink-0" />
          <span className="text-xs text-warning">
            File changed on disk.
          </span>
          <button
            onClick={handleReload}
            className="text-xs text-accent hover:underline"
          >
            Reload
          </button>
          <span className="text-xs text-muted">|</span>
          <button
            onClick={handleKeepMine}
            className="text-xs text-muted hover:text-primary-text"
          >
            Keep mine
          </button>
          {writeFile.isPending && (
            <Loader2 size={12} className="ml-auto animate-spin text-accent" />
          )}
        </div>
      )}

      {/* Save status bar */}
      {writeFile.isPending && !externalChange && (
        <div className="flex items-center gap-2 bg-accent/5 border-b border-border px-3 py-1">
          <Loader2 size={11} className="animate-spin text-accent" />
          <span className="text-[10px] text-accent">Saving...</span>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          theme={themeName}
          language={language}
          defaultValue={fileData?.content ?? ""}
          onMount={handleEditorMount}
          onChange={handleChange}
          options={{
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: "off",
            tabSize: 2,
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}

/** Infer Monaco language ID from file extension */
function inferLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    dockerfile: "dockerfile",
    makefile: "makefile",
    graphql: "graphql",
    gql: "graphql",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    java: "java",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    lua: "lua",
    r: "r",
  };
  return map[ext] ?? "plaintext";
}
