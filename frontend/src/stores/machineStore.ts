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

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  activeMachineId: null,
  claudeViewActive: false,
  machineStatuses: {},
  setMachines: (machines) =>
    set({
      machines: [...machines].sort((a, b) =>
        a.id === LOCAL_MACHINE_ID ? -1 : b.id === LOCAL_MACHINE_ID ? 1 : 0,
      ),
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
  setActiveMachine: (id) => set({ activeMachineId: id, claudeViewActive: false }),
  setClaudeViewActive: (active) => set({ claudeViewActive: active, activeMachineId: active ? null : null }),
  setMachineStatus: (id, status) =>
    set((s) => ({
      machineStatuses: { ...s.machineStatuses, [id]: status },
    })),
}));
