import { useEffect, useRef, useState } from 'react';
import { CameraIcon, CaretLeftIcon, CopySimpleIcon, DownloadSimpleIcon, FilePdfIcon, ImagesIcon, TextAaIcon, WarningIcon } from '@phosphor-icons/react';
import { NavBar, BarButton } from '../components/NavBar';
import { Section, Cell } from '../components/List';
import { Button, Segmented, Switch } from '../components/Controls';
import { ActionSheet } from '../components/Sheet';
import { showToast } from '../components/Toast';
import { goBack } from '../router';
import { pickFiles, ACCEPT_IMAGES, ACCEPT_PDF } from '../lib/pickFiles';
import { OcrCancelled, cancelOcr, expandSources, mergePagePdfs, recognizeSource, sourceLabel, type OcrSource } from '../lib/ocr';
import {
  friendlyOcrError,
  joinPages,
  ocrFileName,
  shouldWarn,
  wordCount,
  type OcrCleanup,
  type OcrLang,
  type OcrPageResult,
} from '../lib/ocrText';
import s from './Ocr.module.css';

type Phase = 'idle' | 'preparing' | 'running' | 'done';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Ocr() {
  const [lang, setLang] = useState<OcrLang>('eng');
  const [cleanup, setCleanup] = useState<OcrCleanup>('off');
  const [makePdf, setMakePdf] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ page: 0, total: 0, pct: 0 });
  const [results, setResults] = useState<OcrPageResult[]>([]);
  const [text, setText] = useState('');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [pendingBig, setPendingBig] = useState<OcrSource[] | null>(null);
  const cancelled = useRef(false);
  const resultRef = useRef<HTMLElement>(null);

  // Leaving the screen stops any OCR in progress.
  useEffect(
    () => () => {
      cancelled.current = true;
      cancelOcr();
    },
    [],
  );

  const choose = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setPhase('preparing');
    const { sources, skipped } = await expandSources(files);
    if (!sources.length) {
      setPhase(results.length ? 'done' : 'idle');
      setError(skipped[0] ?? 'Nothing to read in these files.');
      setNotes(skipped.slice(1));
      return;
    }
    setNotes(skipped);
    if (shouldWarn(sources.length)) {
      setPendingBig(sources);
      setPhase(results.length ? 'done' : 'idle');
      return;
    }
    run(sources);
  };

  const run = async (sources: OcrSource[]) => {
    cancelled.current = false;
    setPhase('running');
    setError(null);
    setPdfBytes(null);
    const out: OcrPageResult[] = [];
    const pdfs: Uint8Array[] = [];
    for (let i = 0; i < sources.length; i++) {
      if (cancelled.current) break;
      setProgress({ page: i + 1, total: sources.length, pct: 0 });
      const label = sourceLabel(sources[i]);
      try {
        const r = await recognizeSource(sources[i], { lang, cleanup, pdf: makePdf }, (p) =>
          setProgress({ page: i + 1, total: sources.length, pct: Math.round(p * 100) }),
        );
        out.push({ page: i + 1, label, text: r.text });
        if (r.pdf) pdfs.push(r.pdf);
      } catch (e) {
        if (cancelled.current || e instanceof OcrCancelled) break;
        console.error(e);
        const msg = friendlyOcrError(e);
        out.push({ page: i + 1, label, text: '', error: msg });
        // Missing OCR files or no memory: later pages would fail the same way.
        if (/downloaded|memory/.test(msg)) {
          setError(msg);
          break;
        }
      }
    }
    if (cancelled.current && !out.length) {
      setPhase(results.length ? 'done' : 'idle');
      return;
    }
    setResults(out);
    setText(joinPages(out));
    if (makePdf && pdfs.length && pdfs.length === out.filter((r) => !r.error).length) {
      try {
        setPdfBytes(await mergePagePdfs(pdfs));
      } catch {
        showToast("Couldn't make the searchable PDF. The text is still here.");
      }
    }
    if (cancelled.current) showToast(`Stopped. ${out.length} of ${sources.length} pages read.`);
    setPhase('done');
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const cancel = () => {
    cancelled.current = true;
    cancelOcr();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Text copied');
    } catch {
      showToast('Copy is blocked here. Select the text and copy it by hand.');
    }
  };

  const busy = phase === 'running' || phase === 'preparing';
  const failed = results.filter((r) => r.error).length;

  return (
    <main className={`${s.screen} screen-push`}>
      <NavBar
        title="Extract Text"
        left={
          <BarButton onClick={() => (busy ? cancel() : goBack('/'))} label="Back">
            <CaretLeftIcon size={22} weight="bold" />
            Tools
          </BarButton>
        }
      />

      <Section header="Language">
        <div className={s.pad}>
          <Segmented<OcrLang>
            label="Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'eng', label: 'English' },
              { value: 'hin', label: 'हिन्दी' },
              { value: 'eng+hin', label: 'Both' },
            ]}
          />
        </div>
      </Section>

      <Section
        header="Clean Up Before Reading"
        footer="Enhance fixes shadows and faint text. B&W helps with poor photos. Off is best for clean PDFs."
      >
        <div className={s.pad}>
          <Segmented<OcrCleanup>
            label="Clean up"
            value={cleanup}
            onChange={setCleanup}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'enhance', label: 'Enhance' },
              { value: 'bw', label: 'B&W' },
            ]}
          />
        </div>
        <Cell title="Make Searchable PDF" accessory={<Switch checked={makePdf} onChange={setMakePdf} label="Make searchable PDF" />} />
      </Section>

      {busy ? (
        <div className={s.progressCard} role="status" aria-live="polite">
          <div className={s.progressText}>
            {phase === 'preparing' ? 'Opening files' : `Page ${progress.page} of ${progress.total} – ${progress.pct}%`}
          </div>
          <div className={s.bar}>
            <span
              style={{
                width: `${progress.total ? ((progress.page - 1 + progress.pct / 100) / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className={s.hint}>The first time, the OCR files are downloaded. After that it works offline.</p>
          <Button variant="tinted" onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className={s.inputs}>
          <button className={s.big} onClick={() => pickFiles(ACCEPT_IMAGES, { capture: true, multiple: false }).then(choose)}>
            <CameraIcon size={30} />
            <span>Take Photo</span>
          </button>
          <button className={s.big} onClick={() => pickFiles(ACCEPT_IMAGES).then(choose)}>
            <ImagesIcon size={30} />
            <span>Choose Images</span>
          </button>
          <button className={s.big} onClick={() => pickFiles(ACCEPT_PDF).then(choose)}>
            <FilePdfIcon size={30} />
            <span>Choose PDF</span>
          </button>
        </div>
      )}

      {error && (
        <p className={s.error} role="alert">
          <WarningIcon size={20} weight="fill" />
          {error}
        </p>
      )}
      {notes.map((n) => (
        <p key={n} className={s.note}>
          {n}
        </p>
      ))}

      {phase === 'done' && results.length > 0 && (
        <section className={s.result} ref={resultRef}>
          <div className={s.resultHead}>
            <h2>Text</h2>
            <span>
              {results.length} {results.length === 1 ? 'page' : 'pages'}, {wordCount(text)} words
              {failed ? `, ${failed} failed` : ''}
            </span>
          </div>
          <textarea
            className={s.text}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Recognized text"
            spellCheck={false}
            placeholder="No text was found. Try Enhance or B&W, or a sharper photo."
          />
          <div className={s.actions}>
            <Button icon={<CopySimpleIcon size={20} weight="bold" />} onClick={copy} disabled={!text}>
              Copy
            </Button>
            <Button
              variant="tinted"
              icon={<DownloadSimpleIcon size={20} weight="bold" />}
              onClick={() => download(new Blob([text], { type: 'text/plain;charset=utf-8' }), ocrFileName('txt'))}
              disabled={!text}
            >
              Download .txt
            </Button>
            {pdfBytes && (
              <Button
                variant="tinted"
                icon={<TextAaIcon size={20} weight="bold" />}
                onClick={() => download(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), ocrFileName('pdf'))}
              >
                Download Searchable PDF
              </Button>
            )}
          </div>
        </section>
      )}

      <ActionSheet
        open={!!pendingBig}
        onClose={() => setPendingBig(null)}
        title={pendingBig ? `${pendingBig.length} pages. Reading this many pages is slow on phones (about 5 to 15 seconds each) and uses a lot of memory.` : undefined}
        actions={[
          {
            label: `Read All ${pendingBig?.length ?? ''} Pages`,
            onSelect: () => {
              const src = pendingBig;
              setPendingBig(null);
              if (src) run(src);
            },
          },
          {
            label: 'Read First 20 Pages',
            onSelect: () => {
              const src = pendingBig;
              setPendingBig(null);
              if (src) run(src.slice(0, 20));
            },
          },
        ]}
      />
    </main>
  );
}
