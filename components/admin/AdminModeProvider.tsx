"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "monte-cristo-admin-mode";

function readPersistedAdminMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistAdminMode(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // private browsing or storage quota
  }
}

interface AdminModeContextValue {
  isAdmin: boolean;
  adminMode: boolean;
  setAdminMode: (on: boolean) => void;
}

const AdminModeContext = createContext<AdminModeContextValue>({
  isAdmin: false,
  adminMode: false,
  setAdminMode: () => {},
});

export function useAdminMode() {
  return useContext(AdminModeContext);
}

export function AdminModeProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [adminMode, setAdminModeState] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setAdminModeState(readPersistedAdminMode());
    } else {
      setAdminModeState(false);
    }
  }, [isAdmin]);

  const setAdminMode = useCallback(
    (on: boolean) => {
      if (!isAdmin) return;
      setAdminModeState(on);
      persistAdminMode(on);
    },
    [isAdmin],
  );

  return (
    <AdminModeContext.Provider value={{ isAdmin, adminMode, setAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}
