import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AppHeaderTargetProvider } from './AppHeaderPortal';
import styles from './AppShell.module.css';

const navigation = [
  { to: '/scenes', label: 'Сцены', shortLabel: 'Сц' },
  { to: '/audit', label: 'Аудит', shortLabel: 'Ау' },
  { to: '/diff', label: 'Сравнение', shortLabel: 'Δ' },
  { to: '/markdown', label: 'Markdown', shortLabel: 'Md' },
  { to: '/html', label: 'Text → HTML', shortLabel: '<>' },
  { to: '/about', label: 'О приложении', shortLabel: 'i' },
] as const;

export default function AppShell() {
  const [openMenuPath, setOpenMenuPath] = useState<string>();
  const location = useLocation();
  const isMenuOpen = openMenuPath === location.pathname;
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    mainRef.current?.focus();
    headerTarget?.scrollTo({ left: 0 });
  }, [headerTarget, location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuPath(undefined);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Перейти к содержимому
      </a>

      <header className={styles.appHeader}>
        <button
          ref={menuButtonRef}
          className={styles.menuButton}
          type="button"
          aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() =>
            setOpenMenuPath((value) =>
              value === location.pathname ? undefined : location.pathname,
            )
          }
        >
          <span aria-hidden="true">{isMenuOpen ? '×' : '☰'}</span>
        </button>
        <div
          ref={setHeaderTarget}
          className={`${styles.headerContext} ${isMenuOpen ? styles.headerContextHidden : ''}`}
        />
      </header>

      <aside
        className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ''}`}
        aria-hidden={!isMenuOpen}
        inert={!isMenuOpen}
      >
        <NavLink
          className={styles.brand}
          to="/scenes"
          aria-label="WriterToolkit"
          onClick={() => setOpenMenuPath(undefined)}
        >
          <span className={styles.brandMark} aria-hidden="true">
            W
          </span>
          <span>WriterToolkit</span>
        </NavLink>

        <nav
          id="primary-navigation"
          className={styles.navigation}
          aria-label="Основная навигация"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              onClick={() => setOpenMenuPath(undefined)}
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.shortLabel}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <p className={styles.storageNote}>Тексты остаются в этом браузере</p>
      </aside>

      {isMenuOpen && (
        <button
          className={styles.backdrop}
          type="button"
          aria-label="Закрыть меню"
          onClick={() => {
            setOpenMenuPath(undefined);
            window.requestAnimationFrame(() => menuButtonRef.current?.focus());
          }}
        />
      )}

      <AppHeaderTargetProvider target={headerTarget}>
        <main ref={mainRef} id="main-content" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </AppHeaderTargetProvider>
    </div>
  );
}
