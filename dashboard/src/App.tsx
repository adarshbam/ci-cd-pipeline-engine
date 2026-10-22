import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataModeProvider } from './context/DataModeContext';
import { Layout } from './components/layout/Layout';
import { WorkflowDetailPage } from './pages/WorkflowDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { RunsListPage } from './pages/RunsListPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { ArtifactsPage } from './pages/ArtifactsPage';
import { SecretsPage } from './pages/SecretsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <DataModeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Default to the flagship screenshot view */}
            <Route index element={<WorkflowDetailPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="workflows/:id" element={<WorkflowDetailPage />} />
            <Route path="runs" element={<RunsListPage />} />
            <Route path="runs/:id" element={<WorkflowDetailPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="environments" element={<DeploymentsPage />} />
            <Route path="artifacts" element={<ArtifactsPage />} />
            <Route path="secrets" element={<SecretsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataModeProvider>
  );
};

export default App;
