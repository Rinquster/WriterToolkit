import { Link } from 'react-router';
import PageHeader from '../../design-system/components/PageHeader';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage() {
  useDocumentTitle('Страница не найдена');

  return (
    <>
      <PageHeader
        title="Страница не найдена"
        description="Такого инструмента или документа в WriterToolkit нет."
      />
      <div className={styles.content}>
        <p>Проверьте адрес или вернитесь к документам сцен.</p>
        <Link className={styles.link} to="/scenes">
          Открыть документы сцен
        </Link>
      </div>
    </>
  );
}
