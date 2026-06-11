import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "creator" | "student";

const STORAGE_KEY = "alyson-view-mode";

const ViewModeContext = createContext<{
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
} | null>(null);

export function ViewModeProvider({
  children,
  defaultMode = "creator",
}: {
  children: ReactNode;
  defaultMode?: ViewMode;
}) {
  const [mode, setModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    return stored === "student" || stored === "creator" ? stored : defaultMode;
  });

  const setMode = (m: ViewMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return (
    <ViewModeContext.Provider value={{ mode, setMode }}>{children}</ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider");
  return ctx;
}
