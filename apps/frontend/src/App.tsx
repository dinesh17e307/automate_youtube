import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Content from './pages/Content';
import ContentDetail from './pages/ContentDetail';
import Settings from './pages/Settings';
import Characters from './pages/Characters';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/content', label: 'Content', icon: '🎬' },
  { to: '/characters', label: 'Characters', icon: '🐰' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-white/10 backdrop-blur-lg border-r border-white/20 p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
            <span className="text-2xl">🎵</span>
            KidsTube AI
          </h1>
          <p className="text-white/60 text-sm mt-1">Automated Content Pipeline</p>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-white/20 text-white shadow-lg'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10">
          <p className="text-white/40 text-xs text-center">v1.0.0 — Production Ready</p>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/content" element={<Content />} />
          <Route path="/content/:id" element={<ContentDetail />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
