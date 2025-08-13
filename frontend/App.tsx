import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { LanguageProvider } from './contexts/LanguageContext';
import Dashboard from './pages/Dashboard';
import ProjectAnalysis from './pages/ProjectAnalysis';
import UploadProject from './pages/UploadProject';
import Navigation from './components/Navigation';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Navigation />
            <main className="container mx-auto px-4 py-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<UploadProject />} />
                <Route path="/project/:projectId" element={<ProjectAnalysis />} />
              </Routes>
            </main>
            <Toaster />
          </div>
        </Router>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
