'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ComparisonResult } from '@/lib/types';

interface HeaderData {
  result: ComparisonResult;
  onCompareAnother?: () => void;
  compareAnotherHref?: string;
  metadata?: {
    createdAt: string;
    expiresAt: string;
  };
  syncEnabled?: boolean;
  onToggleSync?: () => void;
}

interface HeaderContextType {
  headerData: HeaderData | null;
  setHeaderData: (data: HeaderData | null) => void;
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerData, setHeaderData] = useState<HeaderData | null>(null);

  return (
    <HeaderContext.Provider value={{ headerData, setHeaderData }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }
  return ctx;
}
