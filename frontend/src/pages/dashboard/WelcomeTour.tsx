/**
 * WelcomeTour — auto-starts the onboarding tour for first-time users.
 */

import { useEffect, useRef } from "react";
import { useOnboarding } from "@/components/providers/onboarding/OnboardingProvider";

const SIDEBAR_SELECTOR = ".sidebar-brand";
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 20; // stop after 10s to avoid infinite polling

interface WelcomeTourProps {
  isWorkspaceLoading: boolean;
}

export default function WelcomeTour({ isWorkspaceLoading }: WelcomeTourProps) {
  const { startTour, isCompleted } = useOnboarding();
  const tourStartedRef = useRef(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (isWorkspaceLoading || tourStartedRef.current) return;
    if (isCompleted("welcome")) return;

    tourStartedRef.current = true;
    const intervalId = setInterval(() => {
      if (document.querySelector(SIDEBAR_SELECTOR)) {
        clearInterval(intervalId);
        startTour("welcome");
        return;
      }
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        console.warn("[WelcomeTour] Max poll attempts reached — sidebar not found");
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isWorkspaceLoading, startTour, isCompleted]);

  return null;
}
