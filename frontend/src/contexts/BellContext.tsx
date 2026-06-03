import { createContext, useContext, useState, ReactNode } from 'react';

interface BellContextType {
  openBell: boolean;
  triggerOpenBell: () => void;
  resetBell: () => void;
}

const BellContext = createContext<BellContextType | undefined>(undefined);

export function BellProvider({ children }: { children: ReactNode }) {
  const [openBell, setOpenBell] = useState(false);

  return (
    <BellContext.Provider value={{
      openBell,
      triggerOpenBell: () => setOpenBell(true),
      resetBell: () => setOpenBell(false),
    }}>
      {children}
    </BellContext.Provider>
  );
}

export function useBell() {
  const ctx = useContext(BellContext);
  if (!ctx) throw new Error('useBell must be used within BellProvider');
  return ctx;
}
