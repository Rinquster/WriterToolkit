import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import AppShell from './AppShell';
import { normalizeBase } from './routing';
import styles from './App.module.css';

const AboutPage = lazy(() => import('../features/about/AboutPage'));
const DiffPage = lazy(() => import('../features/diff/DiffPage'));
const HtmlTaggerPage = lazy(() => import('../features/html-tagger/HtmlTaggerPage'));
const MarkdownPage = lazy(() => import('../features/markdown/MarkdownPage'));
const NotFoundPage = lazy(() => import('../features/not-found/NotFoundPage'));
const SceneEditorPage = lazy(() => import('../features/scenes/SceneEditorPage'));
const ScenesPage = lazy(() => import('../features/scenes/ScenesPage'));
const TextAuditPage = lazy(() => import('../features/text-audit/TextAuditPage'));

function RouteFallback() {
  return (
    <div className={styles.routeFallback} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      Загружаем инструмент…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={normalizeBase(import.meta.env.BASE_URL)}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/scenes" replace />} />
            <Route path="scenes" element={<ScenesPage />} />
            <Route path="scenes/:documentId" element={<SceneEditorPage />} />
            <Route path="audit" element={<TextAuditPage />} />
            <Route path="diff" element={<DiffPage />} />
            <Route path="markdown" element={<MarkdownPage />} />
            <Route path="html" element={<HtmlTaggerPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
