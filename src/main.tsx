import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import './visuals.css';
import './teacher.css';
const root = createRoot(document.getElementById('root')!);
if (window.location.pathname === '/teacher' || window.location.pathname.startsWith('/teacher/')) {
  void import('./TeacherApp.tsx').then(({ TeacherApp }) => root.render(<TeacherApp />));
} else root.render(<App />);
