import { create } from "zustand";
import type { Machine, MachineStatus } from "../types";

interface MachineState {
  machines: Machine[];
  activeMachineId: string | null;
  machineStatuses: Record<string, MachineStatus>;
  setMachines: (machines: Machine[]) => void;
  addMachine: (machine: Machine) => void;
  removeMachine: (id: string) => void;
  setActiveMachine: (id: string) => void;
  setMachineStatus: (id: string, status: MachineStatus) => void;
}

export const useMachineStore = create<MachineState>((set) => ({
  machines: [],
  activeMachineId: null,
  machineStatuses: {},
  setMachines: (machines) => set({ machines }),
  addMachine: (machine) =>
    set((s) => ({ machines: [...s.machines, machine] })),
  removeMachine: (id) =>
    set((s) => ({
      machines: s.machines.filter((m) => m.id !== id),
      activeMachineId: s.activeMachineId === id ? null : s.activeMachineId,
    })),
  setActiveMachine: (id) => set({ activeMachineId: id }),
  setMachineStatus: (id, status) =>
    set((s) => ({
      machineStatuses: { ...s.machineStatuses, [id]: status },
    })),
}));
