import { create } from "zustand";
import { apiFetch } from "../api/client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  structured_cards?: StructuredCard[];
  timestamp: string;
}

export interface StructuredCard {
  type:
    | "credential_prompt"
    | "config_step"
    | "test_running"
    | "test_success"
    | "test_failed"
    | "deploy_ready"
    | "deploy_complete";
  data: Record<string, unknown>;
}

interface IntegratorStore {
  isOpen: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  machineId: string | null;
  workerId: string | null;
  loading: boolean;
  deploying: boolean;
  deployed: boolean;
  availableMachines: Array<{ id: string; name: string }>;
  credentialSaved: boolean;

  open: (workerId?: string) => void;
  close: () => void;
  setMachineId: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  deploy: (scriptPath: string, name: string, sourceType: string) => Promise<void>;
  fetchMachines: () => Promise<void>;
  reset: () => void;
  setCredentialSaved: (saved: boolean) => void;
}

export const useIntegratorStore = create<IntegratorStore>((set, get) => ({
  isOpen: false,
  messages: [],
  sessionId: null,
  machineId: null,
  workerId: null,
  loading: false,
  deploying: false,
  deployed: false,
  availableMachines: [],
  credentialSaved: false,

  open: (workerId?: string) => {
    set({ isOpen: true, workerId: workerId ?? null });
    get().fetchMachines();
  },

  close: () => set({ isOpen: false }),

  setMachineId: (id: string) => set({ machineId: id }),

  sendMessage: async (content: string) => {
    const { sessionId, machineId, workerId, messages } = get();

    if (!machineId) return;

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    set({ messages: [...messages, userMsg], loading: true });

    try {
      const res = await apiFetch("/api/integrator/message", {
        method: "POST",
        body: JSON.stringify({
          content,
          session_id: sessionId,
          machine_id: machineId,
          worker_id: workerId,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${err}`,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, errMsg], loading: false }));
        return;
      }

      const data = await res.json();

      // Map structured_cards from API response to typed cards
      const cards: StructuredCard[] = (data.structured_cards || []).map(
        (c: Record<string, unknown>) => {
          const cardType = c.type as string;
          if (cardType === "test_result") {
            return {
              type: c.success ? "test_success" : "test_failed",
              data: c,
            };
          }
          return { type: cardType, data: c };
        },
      );

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content,
        structured_cards: cards.length > 0 ? cards : undefined,
        timestamp: new Date().toISOString(),
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        sessionId: data.session_id || s.sessionId,
        loading: false,
      }));
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Network error: ${err instanceof Error ? err.message : "Unknown"}`,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({ messages: [...s.messages, errMsg], loading: false }));
    }
  },

  deploy: async (scriptPath: string, name: string, sourceType: string) => {
    const { workerId } = get();
    set({ deploying: true });

    try {
      const res = await apiFetch("/api/integrator/deploy", {
        method: "POST",
        body: JSON.stringify({
          worker_id: workerId || crypto.randomUUID(),
          script_path: scriptPath,
          name,
          source_type: sourceType,
        }),
      });

      if (res.ok) {
        set({ deploying: false, deployed: true });
      } else {
        const err = await res.text();
        set({ deploying: false });
        // Add error message
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Could not deploy worker: ${err}. Try again or check logs.`,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, errMsg] }));
      }
    } catch (err) {
      set({ deploying: false });
    }
  },

  fetchMachines: async () => {
    try {
      const res = await apiFetch("/api/integrator/machines");
      if (res.ok) {
        const machines = await res.json();
        set({
          availableMachines: machines,
          machineId:
            get().machineId ||
            (machines.length > 0 ? machines[0].id : null),
        });
      }
    } catch {
      // Silently fail -- machines list stays empty
    }
  },

  reset: () =>
    set({
      messages: [],
      sessionId: null,
      workerId: null,
      loading: false,
      deploying: false,
      deployed: false,
      credentialSaved: false,
    }),

  setCredentialSaved: (saved: boolean) => set({ credentialSaved: saved }),
}));

// Listen for "open-integrator" custom event (from IntegrationSettings "New Integration" button)
if (typeof window !== "undefined") {
  window.addEventListener("open-integrator", ((e: CustomEvent) => {
    // Close settings panel when opening integrator
    import("./panelStore").then(({ usePanelStore }) => {
      usePanelStore.getState().setSettingsOpen(false);
    });
    const workerId = e.detail?.workerId;
    useIntegratorStore.getState().open(workerId);
  }) as EventListener);
}
