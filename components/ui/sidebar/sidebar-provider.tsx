"use client";

import * as React from "react";

const SidebarContext = React.createContext<{
  open: boolean;
  toggle: () => void;

  openGroup: string | null;
  toggleGroup: (id: string) => void;

  revealGroup: (id: string) => void;
}>({
  open: true,
  toggle: () => {},
  openGroup: null,
  toggleGroup: () => {},
  revealGroup: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);

  const [openGroup, setOpenGroup] = React.useState<string | null>(null);

  const toggle = React.useCallback(() => setOpen(current => !current), []);

  const toggleGroup = React.useCallback((id: string) => {
    setOpenGroup(current => (current === id ? null : id));
  }, []);

  const revealGroup = React.useCallback((id: string) => {
    setOpenGroup(current => (current === id ? current : id));
  }, []);

  React.useEffect(() => {
    if (!open) setOpenGroup(null);
  }, [open]);

  const value = React.useMemo(
    () => ({ open, toggle, openGroup, toggleGroup, revealGroup }),
    [open, toggle, openGroup, toggleGroup, revealGroup]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  return React.useContext(SidebarContext);
}
