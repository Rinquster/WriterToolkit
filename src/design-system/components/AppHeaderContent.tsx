import type { ReactNode } from 'react';
import { AppHeaderPortal } from '../../app/AppHeaderPortal';
import styles from './AppHeaderContent.module.css';

interface AppHeaderContentProps {
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
}

export default function AppHeaderContent({
  title,
  status,
  actions,
}: AppHeaderContentProps) {
  return (
    <AppHeaderPortal>
      <div className={styles.content}>
        <div className={styles.identity}>
          <h1>{title}</h1>
          {status && <div className={styles.status}>{status}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </AppHeaderPortal>
  );
}
