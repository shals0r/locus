import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  CaseSensitive,
  Regex,
  FileCode,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useRepoStore } from "../../stores/repoStore";
import { useSessionStore } from "../../stores/sessionStore";
import { apiGet } from "../../hooks/useApi";

interface FileMatch {
  line: number;
  text: string;
}

interface FileSearchResult {
  file: string;
  matches: FileMatch[];
}

interface FileSearchResponse {
  results: FileSearchResult[];
  truncated: boolean;
}

export function FileSearch() {
  const selectedMachineId = useRepoStore((s) => s.selectedMachineId);
  const selectedRepoPath = useRepoStore((s) => s.selectedRepoPath);
  const openDiffTab = useSessionStore((s) => s.openDiffTab);

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(value.trim());
        setExpandedFiles(new Set());
      }, 300);
    },
    [],
  );

  const { data, isLoading } = useQuery({
    queryKey: [
      "file-search",
      selectedMachineId,
      selectedRepoPath,
      debouncedQuery,
      caseSensitive,
      useRegex,
    ],
    queryFn: async (): Promise<FileSearchResponse> => {
      const params = new URLSearchParams({
        machine_id: selectedMachineId!,
        repo_path: selectedRepoPath!,
        query: debouncedQuery,
        case_sensitive: String(caseSensitive),
        regex: String(useRegex),
      });
      return apiGet<FileSearchResponse>(`/api/files/search?${params.toString()}`);
    },
    enabled: !!selectedMachineId && !!selectedRepoPath && debouncedQuery.length > 0,
    staleTime: 15_000,
  });

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleMatchClick = useCallback(
    (filePath: string, _lineNumber: number) => {
      if (!selectedMachineId || !selectedRepoPath) return;
      // Open file in a diff/editor tab -- for now open as a file diff tab
      // which shows the file content. A dedicated editor tab type can be
      // added when the editor subsystem is built.
      openDiffTab({
        type: "file",
        machineId: selectedMachineId,
        repoPath: selectedRepoPath,
        filePath,
        label: filePath.split("/").pop() ?? filePath,
      });
    },
    [selectedMachineId, selectedRepoPath, openDiffTab],
  );

  /** Focus the search input -- called externally via ref or command palette */
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Expose focusInput for external use (e.g., command palette)
  // The component stores it on the window for simplicity
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__locusFileSearchFocus = focusInput;
  }

  const results = data?.results ?? [];
  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Search input */}
      <div className="border-b border-border p-2">
        <div className="flex items-center gap-1.5 rounded border border-border bg-dominant px-2 py-1">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search across files..."
            className="w-full bg-transparent text-xs text-primary-text outline-none placeholder:text-muted"
          />
        </div>

        {/* Search options */}
        <div className="mt-1.5 flex items-center gap-1">
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              caseSensitive
                ? "bg-accent/20 text-accent"
                : "text-muted hover:text-primary-text hover:bg-hover"
            }`}
            title="Match Case"
          >
            <CaseSensitive size={12} />
            Aa
          </button>
          <button
            onClick={() => setUseRegex((v) => !v)}
            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              useRegex
                ? "bg-accent/20 text-accent"
                : "text-muted hover:text-primary-text hover:bg-hover"
            }`}
            title="Use Regular Expression"
          >
            <Regex size={12} />
            .*
          </button>
          {results.length > 0 && (
            <span className="ml-auto text-[10px] text-muted">
              {totalMatches} match{totalMatches !== 1 ? "es" : ""} in{" "}
              {results.length} file{results.length !== 1 ? "s" : ""}
              {data?.truncated ? "+" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted" />
            <span className="ml-2 text-xs text-muted">Searching...</span>
          </div>
        )}

        {/* Empty state: no query */}
        {!isLoading && !debouncedQuery && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <Search size={20} className="mb-2 text-muted/40" />
            <p className="text-[10px] text-muted">
              Type to search across files in this repository
            </p>
          </div>
        )}

        {/* No repo selected */}
        {!selectedMachineId || !selectedRepoPath ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <Search size={20} className="mb-2 text-muted/40" />
            <p className="text-[10px] text-muted">
              Select a repository to search
            </p>
          </div>
        ) : null}

        {/* No results */}
        {!isLoading && debouncedQuery && results.length === 0 && selectedMachineId && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <Search size={20} className="mb-2 text-muted/40" />
            <p className="text-[10px] text-muted">
              No matches found for &apos;{debouncedQuery}&apos;
            </p>
          </div>
        )}

        {/* Results list */}
        {results.map((result) => {
          const expanded = expandedFiles.has(result.file);
          const fileName = result.file.split("/").pop() ?? result.file;
          const dirPath = result.file.includes("/")
            ? result.file.substring(0, result.file.lastIndexOf("/"))
            : "";

          return (
            <div key={result.file} className="border-b border-border/50">
              {/* File header */}
              <button
                onClick={() => toggleFile(result.file)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-hover transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={12} className="shrink-0 text-muted" />
                ) : (
                  <ChevronRight size={12} className="shrink-0 text-muted" />
                )}
                <FileCode size={12} className="shrink-0 text-accent" />
                <span className="truncate text-xs text-primary-text">
                  {fileName}
                </span>
                {dirPath && (
                  <span className="truncate text-[10px] text-muted ml-1">
                    {dirPath}
                  </span>
                )}
                <span className="ml-auto shrink-0 rounded bg-secondary px-1 text-[10px] text-muted">
                  {result.matches.length}
                </span>
              </button>

              {/* Expanded matches */}
              {expanded && (
                <div className="bg-dominant/50">
                  {result.matches.map((match, idx) => (
                    <button
                      key={`${result.file}:${match.line}:${idx}`}
                      onClick={() => handleMatchClick(result.file, match.line)}
                      className="flex w-full items-center gap-2 px-4 py-0.5 text-left hover:bg-hover transition-colors"
                    >
                      <span className="w-8 shrink-0 text-right text-[10px] text-muted font-mono">
                        {match.line}
                      </span>
                      <span className="truncate text-[11px] text-primary-text font-mono">
                        {match.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
