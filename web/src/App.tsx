import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Archive } from './pages/Archive.js';
import { ReportDetail } from './pages/ReportDetail.js';
import { LiveStream } from './pages/LiveStream.js';
import { Admin } from './pages/Admin.js';

/**
 * Two surfaces (docs/terminal-site.md):
 *   /                          → archive feed
 *   /reports/:projectId        → permanent versioned report (X posts link here)
 *   /reports/:projectId/v/:v   → pinned version
 *   /r/:reportId               → report by report id (from the live view)
 *   /live/:reportId            → "watch it think" live stream
 */
export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Archive />} />
          <Route path="/reports/:projectId" element={<ReportDetail />} />
          <Route path="/reports/:projectId/v/:version" element={<ReportDetail />} />
          <Route path="/r/:reportId" element={<ReportDetail />} />
          <Route path="/live/:reportId" element={<LiveStream />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
