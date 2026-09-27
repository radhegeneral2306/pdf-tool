import { useEffect, useState } from 'react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CropIcon,
  MagicWandIcon,
  ArrowsClockwiseIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { CropOverlay } from '../components/CropOverlay';
import { Spinner } from '../components/Controls';
import { ActionSheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { goBack, navigate } from '../router';
import { updateProject, useProject } from '../storage/projects';
import { getBlob } from '../storage/db';
import { canvasToBlob, freeCanvas, renderImagePage, type RenderEdits } from '../lib/imageUtils';
import { renderPdfPage } from '../lib/pdfRender';
import { FULL_QUAD, isConvex, isFullQuad, rotateQuad } from '../lib/perspective';
import { FILTERS } from '../lib/filterMeta';
import type { FilterId, PageItem, Quad, Rotation } from '../types';
import s from './PageEditor.module.css';

type Mode = 'crop' | 'filter' | 'rotate';
const PREVIEW_DIM = 1600;
const CHIP_DIM = 220;

async function toUrl(c: HTMLCanvasElement, q = 0.85) {
  const b = await canvasToBlob(c, 'image/jpeg', q);
  freeCanvas(c);
  return URL.createObjectURL(b);
}

/** Renders a preview image URL for the page with the given edits. Stale results are ignored. */
function usePreview(page: PageItem | undefined, edits: RenderEdits | null, maxDim: number) {
  const [out, setOut] = useState<{ key: string; url: string; aspect: number } | null>(null);
  const key = page && edits ? JSON.stringify([page.id, edits, maxDim]) : '';
  useEffect(() => {
    if (!page || !edits) return;
    let alive = true;
    let made: string | null = null;
    (async () => {
      const blob = await getBlob(page.blobId);
      if (!blob || !alive) return;
      const canvas =
        page.kind === 'pdfPage'
          ? (await renderPdfPage(page.blobId, blob, page.pdfPageIndex ?? 0, edits.rotation, maxDim)).canvas
          : (await renderImagePage(blob, edits, maxDim)).canvas;
      const aspect = canvas.width / canvas.height;
      made = await toUrl(canvas);
      if (alive) setOut({ key, url: made, aspect });
      else URL.revokeObjectURL(made);
    })().catch(() => alive && setOut({ key, url: '', aspect: 1 }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => void (out?.url && URL.revokeObjectURL(out.url)), [out]);
  return out?.key === key ? out : null;
}

export function PageEditor({ projectId, pageId }: { projectId: string; pageId: string }) {
  const project = useProject(projectId);
  const index = project ? project.pages.findIndex((p) => p.id === pageId) : -1;
  const page = project && index >= 0 ? project.pages[index] : undefined;
  const isImage = page?.kind === 'image';

  const [draft, setDraft] = useState<{ rotation: Rotation; crop: Quad; filter: FilterId } | null>(null);
  const [mode, setMode] = useState<Mode>('crop');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (page && !draft) {
      setDraft({ rotation: page.rotation, crop: page.crop ?? FULL_QUAD, filter: page.filter });
      setMode(page.kind === 'image' ? 'crop' : 'rotate');
    }
  }, [page, draft]);

  const cropEdits = draft && { rotation: draft.rotation, filter: 'original' as FilterId };
  const fullEdits = draft && { rotation: draft.rotation, crop: isFullQuad(draft.crop) ? undefined : draft.crop, filter: draft.filter };
  const cropPreview = usePreview(page, isImage && mode === 'crop' ? cropEdits : null, PREVIEW_DIM);
  const preview = usePreview(page, mode !== 'crop' || !isImage ? fullEdits : null, PREVIEW_DIM);

  if (project === undefined) return <div className={s.editor} />;
  if (!project || !page || !draft) {
    return (
      <div className={s.editor}>
        <div className={s.missing}>
          <p>This page no longer exists.</p>
          <button className={s.textBtn} onClick={() => navigate(`/doc/${projectId}`, { replace: true })}>
            Back to Document
          </button>
        </div>
      </div>
    );
  }

  const commit = (): boolean => {
    if (!isConvex(draft.crop)) {
      showToast('The crop corners are crossed. Drag them back into a clean shape.');
      setMode('crop');
      return false;
    }
    const crop = isFullQuad(draft.crop) ? undefined : draft.crop;
    updateProject(projectId, (p) => ({
      ...p,
      pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, rotation: draft.rotation, filter: draft.filter, crop } : pg)),
    }));
    return true;
  };

  const go = (delta: number) => {
    const next = project.pages[index + delta];
    if (next && commit()) navigate(`/doc/${projectId}/edit/${next.id}`, { replace: true });
  };

  const rotate = (delta: Rotation) =>
    setDraft({ ...draft, rotation: ((draft.rotation + delta) % 360) as Rotation, crop: rotateQuad(draft.crop, delta) });

  const applyAll = () => {
    const f = draft.filter;
    commit();
    updateProject(projectId, (p) => ({ ...p, pages: p.pages.map((pg) => (pg.kind === 'image' ? { ...pg, filter: f } : pg)) }));
    showToast(`${FILTERS.find((x) => x.id === f)?.label} applied to all photos`);
  };

  const remove = () => {
    const before = project.pages;
    const next = project.pages[index + 1] ?? project.pages[index - 1];
    updateProject(projectId, (p) => ({ ...p, pages: p.pages.filter((pg) => pg.id !== pageId) }));
    showToast('Page deleted', { label: 'Undo', run: () => updateProject(projectId, (p) => ({ ...p, pages: before })) });
    if (next) navigate(`/doc/${projectId}/edit/${next.id}`, { replace: true });
    else goBack(`/doc/${projectId}`);
  };

  const shown = mode === 'crop' && isImage ? cropPreview : preview;

  return (
    <div className={s.editor}>
      <header className={s.top}>
        <button className={s.textBtn} onClick={() => goBack(`/doc/${projectId}`)}>
          Cancel
        </button>
        <div className={s.pager}>
          <button className={s.iconBtn} onClick={() => go(-1)} disabled={index === 0} aria-label="Previous page">
            <CaretLeftIcon size={20} weight="bold" />
          </button>
          <span>
            {index + 1} of {project.pages.length}
          </span>
          <button className={s.iconBtn} onClick={() => go(1)} disabled={index === project.pages.length - 1} aria-label="Next page">
            <CaretRightIcon size={20} weight="bold" />
          </button>
        </div>
        <button className={`${s.textBtn} ${s.done}`} onClick={() => commit() && goBack(`/doc/${projectId}`)}>
          Done
        </button>
      </header>

      <div className={s.stage}>
        {!shown ? (
          <Spinner size={32} light />
        ) : !shown.url ? (
          <p className={s.missing}>This page can't be previewed.</p>
        ) : mode === 'crop' && isImage ? (
          <CropOverlay src={shown.url} aspect={shown.aspect} quad={draft.crop} onChange={(crop) => setDraft({ ...draft, crop })} />
        ) : (
          <img className={s.preview} src={shown.url} alt={`Page ${index + 1} preview`} />
        )}
      </div>

      <div className={s.tools}>
        {mode === 'crop' && isImage && (
          <div className={s.row}>
            <span className={s.help}>Drag the corners to the edges of the page</span>
            <button className={s.textBtn} onClick={() => setDraft({ ...draft, crop: FULL_QUAD })} disabled={isFullQuad(draft.crop)}>
              Reset
            </button>
          </div>
        )}
        {mode === 'filter' && isImage && <FilterStrip page={page} draft={draft} onPick={(filter) => setDraft({ ...draft, filter })} onApplyAll={applyAll} />}
        {mode === 'rotate' && (
          <div className={s.rotateRow}>
            <button className={s.bigBtn} onClick={() => rotate(270)}>
              <ArrowCounterClockwiseIcon size={26} />
              Rotate Left
            </button>
            <button className={s.bigBtn} onClick={() => rotate(90)}>
              <ArrowClockwiseIcon size={26} />
              Rotate Right
            </button>
          </div>
        )}
      </div>

      <nav className={s.modes} aria-label="Edit tools">
        {isImage && (
          <>
            <ModeBtn active={mode === 'crop'} onClick={() => setMode('crop')} icon={<CropIcon size={24} />} label="Crop" />
            <ModeBtn active={mode === 'filter'} onClick={() => setMode('filter')} icon={<MagicWandIcon size={24} />} label="Filters" />
          </>
        )}
        <ModeBtn active={mode === 'rotate'} onClick={() => setMode('rotate')} icon={<ArrowsClockwiseIcon size={24} />} label="Rotate" />
        <button className={`${s.mode} ${s.delete}`} onClick={() => setConfirmDelete(true)}>
          <TrashIcon size={24} />
          <span>Delete</span>
        </button>
      </nav>

      <ActionSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        actions={[{ label: 'Delete Page', destructive: true, onSelect: remove }]}
      />
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button className={`${s.mode} ${active ? s.modeOn : ''}`} onClick={onClick} aria-pressed={active}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FilterStrip({
  page,
  draft,
  onPick,
  onApplyAll,
}: {
  page: PageItem;
  draft: { rotation: Rotation; crop: Quad; filter: FilterId };
  onPick: (f: FilterId) => void;
  onApplyAll: () => void;
}) {
  const crop = isFullQuad(draft.crop) ? undefined : draft.crop;
  return (
    <div className={s.filterWrap}>
      <div className={s.chips} role="radiogroup" aria-label="Filter">
        {FILTERS.map((f) => (
          <FilterChip key={f.id} page={page} edits={{ rotation: draft.rotation, crop, filter: f.id }} label={f.label} active={draft.filter === f.id} onClick={() => onPick(f.id)} />
        ))}
      </div>
      <button className={s.textBtn} onClick={onApplyAll}>
        Apply to All Photos
      </button>
    </div>
  );
}

function FilterChip({ page, edits, label, active, onClick }: { page: PageItem; edits: RenderEdits; label: string; active: boolean; onClick: () => void }) {
  const p = usePreview(page, edits, CHIP_DIM);
  return (
    <button className={`${s.chip} ${active ? s.chipOn : ''}`} onClick={onClick} role="radio" aria-checked={active}>
      <span className={s.chipImg}>{p?.url ? <img src={p.url} alt="" /> : <Spinner size={16} light />}</span>
      <span>{label}</span>
    </button>
  );
}
