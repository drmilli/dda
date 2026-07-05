import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Landing } from './pages/Landing.js';
import { Archive } from './pages/Archive.js';
import { ReportDetail } from './pages/ReportDetail.js';
import { LiveStream } from './pages/LiveStream.js';
import { Admin } from './pages/Admin.js';

/**
 * Surfaces:
 *   /                          → landing page
 *   /app                       → archive feed + submit
 *   /reports/:projectId        → permanent versioned report (X posts link here)
 *   /reports/:projectId/v/:v   → pinned version
 *   /r/:reportId               → report by report id (from the live view)
 *   /live/:reportId            → "watch it think" live stream
 *   /admin                     → human review queue
 */
export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Archive />} />
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
