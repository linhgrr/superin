/**
 * OnboardingProvider — manages guided tours using driver.js.
 */

import { createContext, ReactNode, useContext, useCallback, useState, useEffect, useRef, useMemo } from "react";
import type { Driver } from "driver.js";
import { STORAGE_KEYS } from "@/constants";
import { TOURS, type TourId } from "./onboarding-tours";

interface OnboardingState {
  completedTours: TourId[];
  currentTour: TourId | null;
  stepIndex: number;
}

interface OnboardingContextValue {
  startTour: (tourId: TourId) => void;
  endTour: () => void;
  skipTour: () => void;
  resetTours: () => void;
  isCompleted: (tourId: TourId) => boolean;
  currentTour: TourId | null;
  currentStep: number;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ONBOARDING_STATE);
      return saved ? JSON.parse(saved) : { completedTours: [], currentTour: null, stepIndex: 0 };
    } catch {
      return { completedTours: [], currentTour: null, stepIndex: 0 };
    }
  });

  const [driverObj, setDriverObj] = useState<Driver | null>(null);
  const driverObjRef = useRef(driverObj);
  useEffect(() => {
    driverObjRef.current = driverObj;
  }, [driverObj]);

  // Cleanup driver on unmount
  useEffect(() => {
    return () => {
      if (driverObjRef.current) {
        driverObjRef.current.destroy();
      }
    };
  }, []);

  // Persist state — debounced to avoid writing on every tour step
  const pendingState = useRef<OnboardingState | null>(null);
  useEffect(() => {
    pendingState.current = state;
    const timer = setTimeout(() => {
      try {
        if (pendingState.current) {
          localStorage.setItem(STORAGE_KEYS.ONBOARDING_STATE, JSON.stringify(pendingState.current));
        }
      } catch {
        // Non-critical: localStorage may be unavailable
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [state]);

  // Stable callbacks using refs
  const endTour = useCallback(() => {
    const currentDriver = driverObjRef.current;
    if (currentDriver) currentDriver.destroy();
    setDriverObj(null);
    setState((prev) => ({
      ...prev,
      currentTour: null,
      stepIndex: 0,
      completedTours: prev.currentTour
        ? [...prev.completedTours, prev.currentTour]
        : prev.completedTours,
    }));
  }, []);

  const skipTour = useCallback(() => {
    const currentDriver = driverObjRef.current;
    if (currentDriver) currentDriver.destroy();
    setDriverObj(null);
    setState((prev) => ({
      ...prev,
      currentTour: null,
      stepIndex: 0,
    }));
  }, []);

  const startTour = useCallback((tourId: TourId) => {
    const steps = TOURS[tourId];
    if (!steps?.length) return;

    const run = async () => {
      const [{ driver }] = await Promise.all([
        import("driver.js"),
        import("driver.js/dist/driver.css"),
      ]);

      const currentDriver = driverObjRef.current;
      if (currentDriver) currentDriver.destroy();

      setState((prev) => ({ ...prev, currentTour: tourId, stepIndex: 0 }));

      const d = driver({
        showProgress: true,
        showButtons: ["next", "previous", "close"],
        allowClose: true,
        allowKeyboardControl: true,
        overlayClickBehavior: "close",
        stagePadding: 4,
        stageRadius: 12,
        popoverClass: "shin-onboarding-popover",
        nextBtnText: "Next →",
        prevBtnText: "← Previous",
        doneBtnText: "Finish",
        onHighlighted: (_element, _step, options) => {
          setState((prev) => ({
            ...prev,
            stepIndex: typeof options.state?.activeIndex === "number" ? options.state.activeIndex : 0,
          }));
        },
        onDeselected: () => {
          // Step transition — no action needed
        },
        onDestroyed: () => {
          setState((prev) => ({
            ...prev,
            completedTours: prev.currentTour
              ? [...prev.completedTours, prev.currentTour]
              : prev.completedTours,
            currentTour: null,
            stepIndex: 0,
          }));
          setDriverObj(null);
        },
        onPopoverRender: (popover, { state }) => {
          popover.wrapper.classList.add("shin-tour-step");

          let progressContainer = popover.wrapper.querySelector(".driver-popover-progress") as HTMLElement | null;
          if (!progressContainer) {
            progressContainer = document.createElement("div");
            progressContainer.className = "driver-popover-progress shin-tour-progress";
          }

          const stepsArray = d.getConfig().steps ?? [];
          const activeStepNum = typeof state?.activeIndex === "number" ? state.activeIndex : 0;
          const currentStep = activeStepNum + 1;
          const totalSteps = stepsArray.length > 0 ? stepsArray.length : 1;
          const percent = Math.round((currentStep / totalSteps) * 100);

          progressContainer.innerHTML = `
            <div class="shin-tour-progress-bar">
              <div class="shin-tour-progress-fill" style="width: ${percent}%"></div>
            </div>
            <span class="shin-tour-progress-text">${String(currentStep)} / ${String(totalSteps)}</span>
          `;

          const title = popover.title;
          if (title?.parentNode && progressContainer.parentNode !== title.parentNode) {
            title.parentNode.insertBefore(progressContainer, title);
          }
        },
      });

      setDriverObj(d);
      d.setSteps(steps);
      d.drive();
    };

    void run();
  }, []);

  const resetTours = useCallback(() => {
    const currentDriver = driverObjRef.current;
    if (currentDriver) currentDriver.destroy();
    setDriverObj(null);
    setState({ completedTours: [], currentTour: null, stepIndex: 0 });
    try {
      localStorage.removeItem(STORAGE_KEYS.ONBOARDING_STATE);
    } catch {
      // Non-critical
    }
  }, []);

  const isCompleted = useCallback(
    (tourId: TourId) => state.completedTours.includes(tourId),
    [state.completedTours]
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({ startTour, endTour, skipTour, resetTours, isCompleted, currentTour: state.currentTour, currentStep: state.stepIndex }),
    [startTour, endTour, skipTour, resetTours, isCompleted, state.currentTour, state.stepIndex]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within <OnboardingProvider>");
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export { OnboardingProvider, useOnboarding };
export type { TourId, OnboardingState, OnboardingContextValue };