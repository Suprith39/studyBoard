import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { EntryPage } from './pages/EntryPage';
import { RoomPage } from './pages/RoomPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home — create or join */}
        <Route path="/" element={<EntryPage />} />

        {/* Auto-fill invite code from URL */}
        <Route path="/join/:inviteCode" element={<EntryPage />} />

        {/* Active room board */}
        <Route path="/room/:roomId" element={<RoomPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
