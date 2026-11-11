import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { BarChart3, HandCoins, LayoutDashboard, LogOut, Menu, Milk, PawPrint, Settings as SettingsIcon, Wheat, X } from 'lucide-react';
import { useApp } from '../lib/app';
import { getToken, setToken } from '../lib/api';

const NAV = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard, end: true },
  { to: '/mollar', label: 'Mollar', icon: PawPrint },
  { to: '/sut', label: 'Sut hisobi', icon: Milk },
  { to: '/yemish', label: 'Yemish hisobi', icon: Wheat },
  { to: '/sotuvlar', label: 'Sut sotuvlari', icon: HandCoins },
  { to: '/hisobotlar', label: 'Hisobotlar', icon: BarChart3 },
  { to: '/sozlamalar', label: 'Narxlar va sozlamalar', icon: SettingsIcon },
];
const BOTTOM = [NAV[0], NAV[1], NAV[2], NAV[3]];

function Brand() {
  const { settings } = useApp();
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[15px] font-bold text-stone-900">{settings.farmName}</div>
        <div className="text-xs text-stone-500">Chorvachilik hisobi</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Asosiy menyu">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
            isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900')}>
          <Icon className="h-5 w-5 shrink-0" /> {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Logout() {
  if (!getToken()) return null;
  return (
    <button onClick={() => { setToken(null); window.dispatchEvent(new Event('ferma:auth-required')); }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800">
      <LogOut className="h-5 w-5" /> Chiqish
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-stone-200 bg-white p-4 lg:flex">
        <div className="mb-6 px-1 pt-1"><Brand /></div>
        <NavItems />
        <div className="mt-auto"><Logout /></div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} aria-label="Menyuni ochish" className="rounded-lg p-2 text-stone-700 hover:bg-stone-100"><Menu className="h-6 w-6" /></button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-500">Menyu</span>
              <button onClick={() => setOpen(false)} aria-label="Yopish" className="rounded-lg p-2 hover:bg-stone-100"><X className="h-5 w-5" /></button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <div className="mt-auto"><Logout /></div>
          </div>
        </div>
      )}

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden" aria-label="Tezkor menyu">
        {BOTTOM.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 px-1 pb-2 pt-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-stone-500')}>
            <Icon className="h-6 w-6" /> <span className="max-w-full truncate">{label.replace(' hisobi', '')}</span>
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 px-1 pb-2 pt-2 text-[11px] font-medium text-stone-500">
          <Menu className="h-6 w-6" /> Yana
        </button>
      </nav>
    </div>
  );
}
