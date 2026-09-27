import { useCallback, useState } from 'react';
import {
  ArrowClockwiseIcon,
  CameraIcon,
  CaretLeftIcon,
  FilePlusIcon,
  FilesIcon,
  ImagesIcon,
  MagicWandIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { NavBar, BarButton } from '../components/NavBar';
import { PageGrid } from '../components/PageGrid';
import { ActionSheet, Sheet } from '../components/Sheet';
import { Button } from '../components/Controls';
import { Section } from '../components/List';
import { showToast } from '../components/Toast';
import { withBusy } from '../components/Hud';
import { ExportSheet } from './ExportSheet';
import { goBack, navigate } from '../router';
import { updateProject, useProject } from '../storage/projects';
import { ACCEPT_ANY, ACCEPT_IMAGES, pickFiles } from '../lib/pickFiles';
import { addToProject } from '../lib/importFlow';
import { hasMouse, useFileDrop } from '../lib/dropFiles';
import { rotateQuad } from '../lib/perspective';
import { FILTERS } from '../lib/filterMeta';
import { pagesLabel } from '../lib/format';
import type { FilterId, PageItem, Rotation } from '../types';
import s from './DocumentView.module.css';

export function rotatePage(p: PageItem, delta: Rotation): PageItem {
  return { ...p, rotation: ((p.rotation + delta) % 360) as Rotation, crop: p.crop && rotateQuad(p.crop, delta) };
}

export function DocumentView({ id }: { id: string }) {
  const project = useProject(id);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addSheet, setAddSheet] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const add = useCallback(
    (accept: string) => {
      pickFiles(accept).then((files) => {
        if (files.length) withBusy('Adding files', () => addToProject(id, files));
      });
    },
    [id],
  );

  const drop = useFileDrop((files) => withBusy('Adding files', () => addToProject(id, files)));

  if (project === undefined) return <main className={s.screen} />;
  if (project === null)
    return (
      <main className={s.screen}>
        <NavBar title="" left={<BarButton onClick={() => navigate('/', { replace: true })}><CaretLeftIcon size={22} weight="bold" />Tools</BarButton>} />
        <div className={s.empty}>
          <h2>Document Not Found</h2>
          <p>It may have been deleted.</p>
        </div>
      </main>
    );

  const pages = project.pages;
  const chosen = pages.filter((p) => selected.has(p.id));
  const allSelected = pages.length > 0 && chosen.length === pages.length;

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (pid: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });

  const rotateSelected = () =>
    updateProject(id, (p) => ({ ...p, pages: p.pages.map((pg) => (selected.has(pg.id) ? rotatePage(pg, 90) : pg)) }));

  const filterSelected = (f: FilterId) => {
    const n = chosen.filter((p) => p.kind === 'image').length;
    updateProject(id, (p) => ({ ...p, pages: p.pages.map((pg) => (selected.has(pg.id) && pg.kind === 'image' ? { ...pg, filter: f } : pg)) }));
    if (n < chosen.length) showToast('Filters only apply to photos. PDF pages were left as they are.');
  };

  const deleteSelected = () => {
    const before = pages;
    const count = chosen.length;
    updateProject(id, (p) => ({ ...p, pages: p.pages.filter((pg) => !selected.has(pg.id)) }));
    exitSelect();
    showToast(`${pagesLabel(count)} deleted`, {
      label: 'Undo',
      run: () => updateProject(id, (p) => ({ ...p, pages: before })),
    });
  };

  return (
    <main className={`${s.screen} screen-push ${drop.over ? s.dropping : ''}`} {...drop.props}>
      <NavBar
        title={
          <button className={s.titleBtn} onClick={() => setRenaming(project.title)} aria-label={`Rename ${project.title}`}>
            {project.title}
          </button>
        }
        left={
          selecting ? (
            <BarButton onClick={() => setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)))}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </BarButton>
          ) : (
            <BarButton onClick={() => goBack('/')} label="Back">
              <CaretLeftIcon size={22} weight="bold" />
              Back
            </BarButton>
          )
        }
        right={
          selecting ? (
            <BarButton bold onClick={exitSelect}>
              Done
            </BarButton>
          ) : (
            <BarButton bold disabled={!pages.length} onClick={() => setExporting(true)}>
              Export
            </BarButton>
          )
        }
      />

      {pages.length === 0 ? (
        <div className={s.empty}>
          <FilePlusIcon size={56} weight="thin" />
          <h2>No Pages Yet</h2>
          <p>Scan with the camera or add photos and PDFs.</p>
          <div className={s.emptyBtns}>
            <Button icon={<CameraIcon size={20} weight="fill" />} onClick={() => navigate(`/doc/${id}/camera`)}>
              Scan
            </Button>
            <Button variant="tinted" icon={<PlusIcon size={20} weight="bold" />} onClick={() => setAddSheet(true)}>
              Add Files
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={s.hint}>
            {selecting
              ? `${chosen.length} selected`
              : hasMouse()
                ? `${pagesLabel(pages.length)}. Click a page to edit, drag to reorder. You can also drop files here.`
                : `${pagesLabel(pages.length)}. Tap a page to edit, press and hold to move it.`}
          </p>
          <div className={s.content}>
          <PageGrid
            pages={pages}
            selecting={selecting}
            selected={selected}
            onToggle={toggle}
            onOpen={(pid) => navigate(`/doc/${id}/edit/${pid}`)}
            onReorder={(next) => updateProject(id, (p) => ({ ...p, pages: next }))}
          />
          </div>
        </>
      )}

      <footer className={s.toolbar}>
        {selecting ? (
          <>
            <ToolButton label="Rotate" icon={<ArrowClockwiseIcon size={24} />} disabled={!chosen.length} onClick={rotateSelected} />
            <ToolButton label="Filter" icon={<MagicWandIcon size={24} />} disabled={!chosen.some((p) => p.kind === 'image')} onClick={() => setFilterSheet(true)} />
            <ToolButton label="Delete" icon={<TrashIcon size={24} />} disabled={!chosen.length} onClick={deleteSelected} destructive />
          </>
        ) : (
          <>
            <ToolButton label="Add" icon={<PlusIcon size={24} />} onClick={() => setAddSheet(true)} />
            <ToolButton label="Scan" icon={<CameraIcon size={24} />} onClick={() => navigate(`/doc/${id}/camera`)} />
            <ToolButton label="Select" icon={<span className={s.selectText}>Select</span>} disabled={!pages.length} onClick={() => setSelecting(true)} textOnly />
          </>
        )}
      </footer>

      <ActionSheet
        open={addSheet}
        onClose={() => setAddSheet(false)}
        actions={[
          { label: 'Take Photo', icon: <CameraIcon size={22} />, onSelect: () => navigate(`/doc/${id}/camera`) },
          { label: 'Photo Library', icon: <ImagesIcon size={22} />, onSelect: () => add(ACCEPT_IMAGES) },
          { label: 'Choose Files', icon: <FilesIcon size={22} />, onSelect: () => add(ACCEPT_ANY) },
        ]}
      />

      <ActionSheet
        open={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Apply filter to selected photos"
        actions={FILTERS.map((f) => ({ label: f.label, onSelect: () => filterSelected(f.id) }))}
      />

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename"
        left={<BarButton onClick={() => setRenaming(null)}>Cancel</BarButton>}
        right={
          <BarButton
            bold
            disabled={!renaming?.trim()}
            onClick={() => {
              const t = renaming!.trim();
              updateProject(id, (p) => ({ ...p, title: t }));
              setRenaming(null);
            }}
          >
            Save
          </BarButton>
        }
      >
        <Section footer="This name is only used inside the app. You choose the PDF file name when exporting.">
          <input
            className={s.renameInput}
            value={renaming ?? ''}
            onChange={(e) => setRenaming(e.target.value)}
            aria-label="Document name"
            autoFocus
            maxLength={80}
          />
        </Section>
      </Sheet>

      {exporting && <ExportSheet project={project} onClose={() => setExporting(false)} />}
    </main>
  );
}

function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  destructive,
  textOnly,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  textOnly?: boolean;
}) {
  return (
    <button className={`${s.tool} ${destructive ? s.destructive : ''}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {icon}
      {!textOnly && <span>{label}</span>}
    </button>
  );
}
