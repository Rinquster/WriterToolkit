import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import styles from './AppShell.module.css';

const navigation = [
  { to: '/scenes', label: 'Сцены', shortLabel: 'Сц' },
  { to: '/diff', label: 'Сравнение', shortLabel: 'Δ' },
  { to: '/markdown', label: 'Markdown', shortLabel: 'Md' },
  { to: '/html', label: 'Text → HTML', shortLabel: '<>' },
  { to: '/about', label: 'О приложении', shortLabel: 'i' },
] as const;

export default function AppShell() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Перейти к содержимому
      </a>

      <header className={styles.mobileHeader}>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          <span aria-hidden="true">{isMenuOpen ? '×' : '☰'}</span>
        </button>
        <span className={styles.mobileBrand}>WriterToolkit</span>
      </header>

      <aside className={`${styles.sidebar} ${isMenuOpen ? styles.sidebarOpen : ''}`}>
        <NavLink
          className={styles.brand}
          to="/scenes"
          aria-label="WriterToolkit"
          onClick={() => setIsMenuOpen(false)}
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
              onClick={() => setIsMenuOpen(false)}
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
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <main ref={mainRef} id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
