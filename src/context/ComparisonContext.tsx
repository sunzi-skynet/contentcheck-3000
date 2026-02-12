'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ComparisonResult } from '@/lib/types';

interface ComparisonContextType {
  result: ComparisonResult | null;
  setResult: (result: ComparisonResult | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const ComparisonContext = createContext<ComparisonContextType | undefined>(
  undefined
);

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ComparisonContext.Provider
      value={{ result, setResult, isLoading, setIsLoading, error, setError }}
    >
      {children}
    </ComparisonContext.Provider>
  );
}

export function useComparison() {
  const ctx = useContext(ComparisonContext);
  if (!ctx) {
    throw new Error('useComparison must be used within a ComparisonProvider');
  }
  return ctx;
}
