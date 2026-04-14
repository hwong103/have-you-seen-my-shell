import { Navigate, Route, Routes } from 'react-router-dom';
import { Book } from './pages/Book';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/1" replace />} />
      <Route path="/:pageNumber" element={<Book />} />
      <Route path="*" element={<Navigate to="/1" replace />} />
    </Routes>
  );
}
