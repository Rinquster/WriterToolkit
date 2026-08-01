import PageHeader from '../../design-system/components/PageHeader';
import StatusBadge from '../../design-system/components/StatusBadge';
import { useDocumentTitle } from '../../shared/hooks/useDocumentTitle';
import styles from './AboutPage.module.css';

export default function AboutPage() {
  useDocumentTitle('О приложении');

  return (
    <>
      <PageHeader
        title="О WriterToolkit"
        description="Локальные инструменты для писательской и редакторской работы."
        status={<StatusBadge tone="success">Новая основа</StatusBadge>}
      />
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Приватность</h2>
          <p>
            Приложение не отправляет текст на сервер. Документы и черновики хранятся в
            IndexedDB текущего профиля браузера и экспортируются в локальные файлы.
          </p>
        </section>
        <section className={styles.card}>
          <h2>Совместимость</h2>
          <p>
            Импорт старых JSON сохраняет все сцены, варианты, тексты, порядок и выбор
            активного варианта. Технические ID могут быть созданы заново.
          </p>
        </section>
        <section className={styles.card}>
          <h2>Защита от потерь</h2>
          <p>
            Изменения сохраняются по ревизиям, удалённые документы попадают в локальное
            recovery-хранилище, а legacy-совместимый JSON остаётся переносимой резервной
            копией.
          </p>
        </section>
        <section className={styles.card}>
          <h2>Развёртывание</h2>
          <p>
            WriterToolkit остаётся статическим SPA и не требует backend для работы на
            GitHub Pages.
          </p>
        </section>
      </div>
    </>
  );
}
