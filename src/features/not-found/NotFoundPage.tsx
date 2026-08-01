import { Link } from 'react-router';
import AppHeaderContent from '../../design-system/components/AppHeaderContent';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  useDocumentTitle('Страница не найдена');

  return (
    <>
      <AppHeaderContent title="Страница не найдена" />
      <div className={styles.content}>
        <p>Проверьте адрес или вернитесь к документам сцен.</p>
        <Link className={styles.link} to="/scenes">
          Открыть документы сцен
        </Link>
      </div>
    </>
  );
}
