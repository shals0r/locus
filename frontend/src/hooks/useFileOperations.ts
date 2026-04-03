import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "./useApi";

// ---- Types ----

export interface FileContent {
  content: string;
  language: string;
  size: number;
  mtime: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: string | null;
}

export interface DirectoryListing {
  path: string;
  entries: DirectoryEntry[];
}

export interface FileStat {
  path: string;
  size: number;
  mtime: string;
  is_dir: boolean;
}

// ---- Read file ----

export function useReadFile(machineId: string | null, filePath: string | null) {
  return useQuery<FileContent>({
    queryKey: ["file", machineId, filePath],
    queryFn: () =>
      apiGet<FileContent>(
        `/api/files/read?machine_id=${encodeURIComponent(machineId!)}&file_path=${encodeURIComponent(filePath!)}`,
      ),
    enabled: !!machineId && !!filePath,
    staleTime: 30_000,
  });
}

// ---- Write file ----

interface WriteFileVars {
  machineId: string;
  filePath: string;
  content: string;
  repoPath?: string;
}

export function useWriteFile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, WriteFileVars>({
    mutationFn: ({ machineId, filePath, content }) =>
      apiPost<void>("/api/files/write", {
        machine_id: machineId,
        file_path: filePath,
        content,
      }),
    onSuccess: (_data, variables) => {
      const { machineId, filePath } = variables;
      // Invalidate the file content cache
      void queryClient.invalidateQueries({
        queryKey: ["file", machineId, filePath],
      });
      // Invalidate file stat cache
      void queryClient.invalidateQueries({
        queryKey: ["fileStat", machineId, filePath],
      });
      // Invalidate ALL diff queries for this machine so diff viewer refetches
      void queryClient.invalidateQueries({
        queryKey: ["diff", machineId],
      });
      // Invalidate changed files queries for this machine
      void queryClient.invalidateQueries({
        queryKey: ["changedFiles", machineId],
      });
    },
  });
}

// ---- List directory ----

export function useListDirectory(
  machineId: string | null,
  dirPath: string | null,
  depth: number = 1,
) {
  const queryClient = useQueryClient();

  return useQuery<DirectoryListing>({
    queryKey: ["directory", machineId, dirPath],
    queryFn: async () => {
      const listing = await apiGet<DirectoryListing>(
        `/api/files/list?machine_id=${encodeURIComponent(machineId!)}&dir_path=${encodeURIComponent(dirPath!)}&depth=${depth}`,
      );

      // When depth > 1, prime ALL child directory caches from the flat response
      if (depth > 1 && listing.entries.length > 0) {
        const byParent = new Map<string, DirectoryEntry[]>();
        const cleanRoot = dirPath!.replace(/\/$/, "");

        for (const entry of listing.entries) {
          const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
          const existing = byParent.get(parent) ?? [];
          existing.push(entry);
          byParent.set(parent, existing);
        }

        // Prime cache for every directory level — expanding is instant
        for (const [parent, children] of byParent) {
          queryClient.setQueryData<DirectoryListing>(
            ["directory", machineId, parent],
            { path: parent, entries: children },
          );
        }

        // Return only direct children for the requested directory
        return { path: listing.path, entries: byParent.get(cleanRoot) ?? [] };
      }

      return listing;
    },
    enabled: !!machineId && !!dirPath,
    // Full tree is cached for 5 min — invalidated on file create/rename/delete
    staleTime: 5 * 60 * 1000,
  });
}

// ---- Create file ----

interface CreateFileVars {
  machineId: string;
  filePath: string;
  content?: string;
  isDir?: boolean;
}

export function useCreateFile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, CreateFileVars>({
    mutationFn: ({ machineId, filePath, content, isDir }) =>
      apiPost<void>("/api/files/create", {
        machine_id: machineId,
        file_path: filePath,
        content: content ?? "",
        is_dir: isDir ?? false,
      }),
    onSuccess: (_data, variables) => {
      // Invalidate all directory caches for this machine — triggers full tree re-fetch
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId],
      });
    },
  });
}

// ---- Rename file ----

interface RenameFileVars {
  machineId: string;
  oldPath: string;
  newPath: string;
}

export function useRenameFile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, RenameFileVars>({
    mutationFn: ({ machineId, oldPath, newPath }) =>
      apiPost<void>("/api/files/rename", {
        machine_id: machineId,
        old_path: oldPath,
        new_path: newPath,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId],
      });
      const oldParent = variables.oldPath.substring(
        0,
        variables.oldPath.lastIndexOf("/"),
      );
      const newParent = variables.newPath.substring(
        0,
        variables.newPath.lastIndexOf("/"),
      );
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId, oldParent || "/"],
      });
      if (newParent !== oldParent) {
        void queryClient.invalidateQueries({
          queryKey: ["directory", variables.machineId, newParent || "/"],
        });
      }
      // Invalidate file content for old path
      void queryClient.invalidateQueries({
        queryKey: ["file", variables.machineId, variables.oldPath],
      });
    },
  });
}

// ---- Delete file ----

interface DeleteFileVars {
  machineId: string;
  filePath: string;
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteFileVars>({
    mutationFn: ({ machineId, filePath }) =>
      apiDelete(
        `/api/files/delete?machine_id=${encodeURIComponent(machineId)}&file_path=${encodeURIComponent(filePath)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["file", variables.machineId, variables.filePath],
      });
    },
  });
}

// ---- File stat (for change detection polling) ----

export function useFileStat(
  machineId: string | null,
  filePath: string | null,
  enabled = true,
) {
  return useQuery<FileStat>({
    queryKey: ["fileStat", machineId, filePath],
    queryFn: () =>
      apiGet<FileStat>(
        `/api/files/stat?machine_id=${encodeURIComponent(machineId!)}&file_path=${encodeURIComponent(filePath!)}`,
      ),
    enabled: enabled && !!machineId && !!filePath,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
