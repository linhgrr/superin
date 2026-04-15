import { useCallback, useState } from "react";

export function useAsyncTask(initialPending = false) {
  const [isPending, setIsPending] = useState(initialPending);

  const run = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T> => {
      setIsPending(true);
      try {
        return await task();
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return {
    isPending,
    run,
  };
}
