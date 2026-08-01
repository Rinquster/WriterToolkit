import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  status?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  status,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
      {status && <div className={styles.status}>{status}</div>}
    </header>
  );
}
