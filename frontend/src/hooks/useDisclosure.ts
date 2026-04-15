import { useCallback, useMemo, useState } from "react";

export function useDisclosure(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  return useMemo(
    () => ({
      close,
      isOpen,
      open,
      setIsOpen,
      toggle,
    }),
    [close, isOpen, open, setIsOpen, toggle]
  );
}
