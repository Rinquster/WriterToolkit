import type { ReactNode } from 'react';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
}

export default function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
