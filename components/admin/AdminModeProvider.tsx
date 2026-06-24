"use client";

import React, { createContext, useContext, useState } from "react";

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
  const [adminMode, setAdminMode] = useState(false);
  return (
    <AdminModeContext.Provider value={{ isAdmin, adminMode, setAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}
