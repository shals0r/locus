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
) {
  return useQuery<DirectoryListing>({
    queryKey: ["directory", machineId, dirPath],
    queryFn: () =>
      apiGet<DirectoryListing>(
        `/api/files/list?machine_id=${encodeURIComponent(machineId!)}&dir_path=${encodeURIComponent(dirPath!)}`,
      ),
    enabled: !!machineId && !!dirPath,
    staleTime: 10_000,
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
      // Invalidate parent directory listing
      const parentDir = variables.filePath.substring(
        0,
        variables.filePath.lastIndexOf("/"),
      );
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId, parentDir || "/"],
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
      // Invalidate parent directory listings for both old and new paths
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
      // Invalidate parent directory listing
      const parentDir = variables.filePath.substring(
        0,
        variables.filePath.lastIndexOf("/"),
      );
      void queryClient.invalidateQueries({
        queryKey: ["directory", variables.machineId, parentDir || "/"],
      });
      // Invalidate file content cache
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
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
