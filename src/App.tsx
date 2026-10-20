import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { EntryPage } from './pages/EntryPage';
import { RoomPage } from './pages/RoomPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EntryPage />} />
        <Route path="/join/:inviteCode" element={<EntryPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
