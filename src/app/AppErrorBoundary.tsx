import { Component, type ReactNode } from 'react';
import styles from './AppErrorBoundary.module.css';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // User text must not be copied into logs. A future telemetry adapter can report
    // only an explicit, redacted error code from this boundary.
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className={styles.fallback}>
        <div>
          <span aria-hidden="true">W</span>
          <h1>WriterToolkit не смог продолжить работу</h1>
          <p>
            Локальные данные остались в браузере. Перезагрузите приложение; если ошибка
            повторится, сначала сохраните доступные документы через экспорт.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </div>
      </main>
    );
  }
}
