import React, { createContext, useContext, useState, useEffect } from 'react';
import { DataMode } from '../types';

interface DataModeContextType {
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  toggleDataMode: () => void;
  isRealMode: boolean;
  isDemoMode: boolean;
}

const DataModeContext = createContext<DataModeContextType | undefined>(undefined);

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dataMode, setDataModeState] = useState<DataMode>(() => {
    const saved = localStorage.getItem('cicd_data_mode');
    return saved === 'demo' ? 'demo' : 'real'; // Default to REAL MODE
  });

  const setDataMode = (mode: DataMode) => {
    setDataModeState(mode);
    localStorage.setItem('cicd_data_mode', mode);
  };

  const toggleDataMode = () => {
    setDataMode(dataMode === 'real' ? 'demo' : 'real');
  };

  return (
    <DataModeContext.Provider
      value={{
        dataMode,
        setDataMode,
        toggleDataMode,
        isRealMode: dataMode === 'real',
        isDemoMode: dataMode === 'demo',
      }}
    >
      {children}
    </DataModeContext.Provider>
  );
};

export function useDataMode() {
  const context = useContext(DataModeContext);
  if (!context) {
    throw new Error('useDataMode must be used within a DataModeProvider');
  }
  return context;
}
