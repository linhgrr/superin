import { create } from "zustand";

export type ChatThinkingStepStatus = "active" | "done";

export interface ChatThinkingStep {
  id: string;
  label: string;
  status: ChatThinkingStepStatus;
  order: number;
  updatedAt: number;
}

interface ThinkingEventPayload {
  stepId: string;
  label: string;
  status: ChatThinkingStepStatus;
}

interface ChatThinkingState {
  steps: ChatThinkingStep[];
  beginRun: () => void;
  endRun: () => void;
  clear: () => void;
  applyThinkingEvent: (eventType: string, payload: unknown) => void;
}

const isThinkingPayload = (value: unknown): value is ThinkingEventPayload => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ThinkingEventPayload>;
  return (
    typeof candidate.stepId === "string" &&
    typeof candidate.label === "string" &&
    (candidate.status === "active" || candidate.status === "done")
  );
};

export const useChatThinkingStore = create<ChatThinkingState>()((set) => ({
  steps: [],
  beginRun: () => {
    set({ steps: [] });
  },
  endRun: () => {
    set((state) => ({ steps: state.steps }));
  },
  clear: () => {
    set({ steps: [] });
  },
  applyThinkingEvent: (eventType, payload) => {
    if (eventType !== "thinking" || !isThinkingPayload(payload)) return;

    const updatedAt = Date.now();
    set((state) => {
      const existingIndex = state.steps.findIndex((step) => step.id === payload.stepId);
      if (existingIndex === -1) {
        return {
          steps: [
            ...state.steps,
            {
              id: payload.stepId,
              label: payload.label,
              status: payload.status,
              order: state.steps.length,
              updatedAt,
            },
          ],
        };
      }

      return {
        steps: state.steps.map((step, index) =>
          index === existingIndex
            ? {
                ...step,
                label: payload.label,
                status: payload.status,
                updatedAt,
              }
            : step,
        ),
      };
    });
  },
}));
