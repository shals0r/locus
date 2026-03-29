import { create } from "zustand";
import type { Machine, MachineStatus } from "../types";
import { LOCAL_MACHINE_ID } from "../types";

interface MachineState {
  machines: Machine[];
  activeMachineId: string | null;
  claudeViewActive: boolean;
  machineStatuses: Record<string, MachineStatus>;
  setMachines: (machines: Machine[]) => void;
  addMachine: (machine: Machine) => void;
  removeMachine: (id: string) => void;
  setActiveMachine: (id: string) => void;
  setClaudeViewActive: (active: boolean) => void;
  setMachineStatus: (id: string, status: MachineStatus) => void;
}

function loadActiveMachineId(): string | null {
  try {
    return localStorage.getItem("locus_active_machine");
  } catch {
    return null;
  }
}

function saveActiveMachineId(id: string | null) {
  try {
    if (id) localStorage.setItem("locus_active_machine", id);
    else localStorage.removeItem("locus_active_machine");
  } catch { /* ignore */ }
}

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  activeMachineId: loadActiveMachineId(),
  claudeViewActive: false,
  machineStatuses: {},
  setMachines: (machines) =>
    set((s) => {
      const sorted = [...machines].sort((a, b) =>
        a.id === LOCAL_MACHINE_ID ? -1 : b.id === LOCAL_MACHINE_ID ? 1 : 0,
      );
      // Auto-select: restore persisted machine, or pick first available
      let active = s.activeMachineId;
      if (!active || !sorted.find((m) => m.id === active)) {
        active = sorted[0]?.id ?? null;
        saveActiveMachineId(active);
      }
      return { machines: sorted, activeMachineId: active };
    }),
  addMachine: (machine) =>
    set((s) => ({ machines: [...s.machines, machine] })),
  removeMachine: (id) => {
    if (id === LOCAL_MACHINE_ID) return;
    set((s) => ({
      machines: s.machines.filter((m) => m.id !== id),
      activeMachineId: s.activeMachineId === id ? null : s.activeMachineId,
    }));
  },
  setActiveMachine: (id) => {
    saveActiveMachineId(id);
    set({ activeMachineId: id, claudeViewActive: false });
  },
  setClaudeViewActive: (active) => set((s) => ({ claudeViewActive: active, activeMachineId: active ? null : s.activeMachineId })),
  setMachineStatus: (id, status) =>
    set((s) => ({
      machineStatuses: { ...s.machineStatuses, [id]: status },
    })),
}));
