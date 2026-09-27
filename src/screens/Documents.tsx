import { useEffect, useState } from 'react';
import { FolderSimpleIcon, MagnifyingGlassIcon, MinusCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { NavBar, BarButton } from '../components/NavBar';
import { Cell } from '../components/List';
import { DocThumb } from '../components/DocThumb';
import { ActionSheet } from '../components/Sheet';
import { Button } from '../components/Controls';
import { navigate } from '../router';
import { removeProject, useProjectList } from '../storage/projects';
import { storageUsage } from '../storage/db';
import { formatBytes } from '../lib/compress';
import { dateLabel, pagesLabel } from '../lib/format';
import type { Project } from '../types';
import s from './Documents.module.css';

export function Documents() {
  const projects = useProjectList();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    storageUsage().then(setUsage);
  }, [projects]);

  const q = query.trim().toLowerCase();
  const shown = projects?.filter((p) => !q || p.title.toLowerCase().includes(q)) ?? [];
  const empty = projects && projects.length === 0;

  return (
    <main className={s.screen}>
      <NavBar
        large
        title="Documents"
        right={
          !empty && (
            <BarButton bold={editing} onClick={() => setEditing(!editing)}>
              {editing ? 'Done' : 'Edit'}
            </BarButton>
          )
        }
      />

      {empty ? (
        <div className={s.empty}>
          <FolderSimpleIcon size={56} weight="thin" />
          <h2>No Documents Yet</h2>
          <p>Scan a page or import photos and PDFs from Tools. Everything is saved on this device.</p>
          <div className={s.emptyBtn}>
            <Button variant="tinted" onClick={() => navigate('/', { replace: true })}>
              Go to Tools
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className={s.search}>
            <MagnifyingGlassIcon size={17} aria-hidden />
            <input
              type="search"
              placeholder="Search"
              aria-label="Search documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <XCircleIcon size={17} weight="fill" />
              </button>
            )}
          </label>

          <div className={s.group}>
            {!projects &&
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={s.skeleton}>
                  <span />
                  <span />
                </div>
              ))}
            {shown.map((p) => (
              <div key={p.id} className={s.row}>
                {editing && (
                  <button className={s.minus} aria-label={`Delete ${p.title}`} onClick={() => setConfirm(p)}>
                    <MinusCircleIcon size={24} weight="fill" />
                  </button>
                )}
                <Cell
                  leading={<DocThumb page={p.pages[0]} size={52} />}
                  title={p.title}
                  subtitle={`${pagesLabel(p.pages.length)}, ${dateLabel(p.updatedAt)}`}
                  chevron={!editing}
                  onClick={editing ? () => setConfirm(p) : () => navigate(`/doc/${p.id}`)}
                />
              </div>
            ))}
            {projects && shown.length === 0 && <p className={s.noMatch}>No results for "{query}"</p>}
          </div>
          {usage !== null && <p className={s.footer}>Using {formatBytes(usage)} on this device</p>}
        </>
      )}

      <ActionSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? `Delete "${confirm.title}"? This can't be undone.` : undefined}
        actions={[
          {
            label: 'Delete Document',
            destructive: true,
            onSelect: async () => {
              if (!confirm) return;
              await removeProject(confirm.id);
            },
          },
        ]}
      />
    </main>
  );
}
