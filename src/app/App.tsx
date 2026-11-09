import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { RepositoryProvider } from '@/storage/RepositoryProvider'
import { AppLayout } from './AppLayout'
import { NotFound } from './NotFound'
import { LibraryPage, ImagesPage } from '@/features/library/LibraryPage'
import { ToolsPage } from '@/features/tools/ToolsPage'
import { ToolPage } from '@/features/tools/ToolPage'
import { ConvertHub } from '@/features/tools/ConvertHub'

export function App() {
  return (
    <RepositoryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/documents/all" replace />} />
            <Route path="documents/:view" element={<LibraryPage />} />
            <Route path="images/:view" element={<ImagesPage />} />
            <Route path="tools" element={<ToolsPage kind="pdf" />} />
            <Route path="tools/images" element={<ToolsPage kind="image" />} />
            <Route path="tools/convert" element={<ConvertHub />} />
            <Route path="tools/:toolId" element={<ToolPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RepositoryProvider>
  )
}
