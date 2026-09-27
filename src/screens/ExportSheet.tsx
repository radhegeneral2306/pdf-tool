import { useEffect, useMemo, useState } from 'react';
import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { Sheet } from '../components/Sheet';
import { BarButton } from '../components/NavBar';
import { Section, Cell } from '../components/List';
import { Button, Segmented, Spinner, Switch } from '../components/Controls';
import { showToast } from '../components/Toast';
import { getSettings, rememberExport, updateSettings, useSettings } from '../storage/settings';
import { getBlobSize } from '../storage/db';
import { buildPdf, buildPdfUnder } from '../lib/pdfBuild';
import { browserDeps } from '../lib/exportDeps';
import { PRESETS, estimateBytes, formatBytes, type Level } from '../lib/compress';
import { defaultExportName, finalFileName } from '../lib/fileName';
import type { OutputSize, PageSize, Project } from '../types';
import s from './ExportSheet.module.css';

const SIZE_HELP: Record<OutputSize, string> = {
  original: 'Full quality. Photos you did not edit are added exactly as they are.',
  high: 'Sharp enough to print. Good for most sharing.',
  medium: 'Smaller file for email.',
  small: 'Smallest file for WhatsApp and upload limits.',
  custom: 'Pick a limit. The best quality that fits is chosen for you.',
};

const levelFor = (size: OutputSize): Level | null => (size === 'original' || size === 'custom' ? null : PRESETS[size]);

export function ExportSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const settings = useSettings();
  const [name, setName] = useState(() => defaultExportName(settings.exportedNames));
  // Until the user types a name, every export uses the next free date name (27-09-26, then 27-09-26 (2)).
  const [nameEdited, setNameEdited] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>(settings.pageSize);
  const [size, setSize] = useState<OutputSize>(settings.outputSize);
  const [targetMb, setTargetMb] = useState('2');
  const [compressPdf, setCompressPdf] = useState(false);
  const [margins, setMargins] = useState(false);
  const [blobSizes, setBlobSizes] = useState<Map<string, number> | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ file: File; note?: string } | null>(null);

  const hasImages = project.pages.some((p) => p.kind === 'image');
  const hasPdf = project.pages.some((p) => p.kind === 'pdfPage');

  useEffect(() => {
    const ids = [...new Set(project.pages.map((p) => p.blobId))];
    Promise.all(ids.map(async (id) => [id, await getBlobSize(id)] as const)).then((e) => setBlobSizes(new Map(e)));
  }, [project.pages]);

  const estimate = useMemo(() => {
    if (!blobSizes || size === 'custom') return null;
    return estimateBytes(project.pages, blobSizes, levelFor(size), compressPdf);
  }, [blobSizes, project.pages, size, compressPdf]);

  // Any change to the options makes the previous result stale.
  useEffect(() => {
    setResult(null);
    if (!nameEdited) setName(defaultExportName(getSettings().exportedNames));
  }, [nameEdited, nameEdited && name, pageSize, size, targetMb, compressPdf, margins]);

  const canShare = typeof navigator.canShare === 'function';
  const busy = progress !== null;

  const create = async (): Promise<File | null> => {
    if (result) return result.file;
    setError(null);
    const fileName = nameEdited ? finalFileName(name, settings.exportedNames) : `${defaultExportName(settings.exportedNames)}.pdf`;
    const total = project.pages.length;
    try {
      let bytes: Uint8Array;
      let note: string | undefined;
      if (size === 'custom') {
        const mb = parseFloat(targetMb.replace(',', '.'));
        if (!(mb > 0)) {
          setError('Enter a size limit, for example 2.');
          return null;
        }
        const r = await buildPdfUnder(project.pages, mb * 1024 * 1024, { pageSize, margins, compressPdfPages: compressPdf }, browserDeps, (n) =>
          setProgress(`Finding best quality, try ${n}`),
        );
        bytes = r.bytes;
        if (!r.fits)
          note = `Could not get under ${mb} MB. This is the smallest possible (${formatBytes(bytes.byteLength)}).${
            hasPdf && !compressPdf ? ' Turning on "Compress PDF pages" may help.' : ''
          }`;
      } else {
        setProgress(`Creating PDF, 0 of ${total}`);
        bytes = await buildPdf(project.pages, { pageSize, margins, level: levelFor(size), compressPdfPages: compressPdf }, browserDeps, (d) =>
          setProgress(`Creating PDF, ${d} of ${total}`),
        );
      }
      const file = new File([bytes as BlobPart], fileName, { type: 'application/pdf' });
      rememberExport(fileName.replace(/\.pdf$/, ''));
      updateSettings({ pageSize });
      setResult({ file, note });
      return file;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message ? `Couldn't create the PDF. ${e.message}` : "Couldn't create the PDF. Please try again.");
      return null;
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    const file = await create();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showToast(`Saved "${file.name}" (${formatBytes(file.size)})`);
  };

  const share = async () => {
    const ready = !!result;
    const file = await create();
    if (!file) return;
    if (!navigator.canShare?.({ files: [file] })) {
      showToast('Sharing files is not supported here. Use Save PDF instead.');
      return;
    }
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (e) {
      // Some phones only allow sharing right after a tap. The PDF is ready now, so a second tap works.
      if (!ready && e instanceof DOMException && e.name === 'NotAllowedError') showToast('Your PDF is ready. Tap Share again.');
    }
  };

  const pdfCompressAllowed = size !== 'original';

  return (
    <Sheet
      open
      onClose={busy ? () => {} : onClose}
      title="Export PDF"
      left={
        <BarButton onClick={onClose} disabled={busy}>
          Cancel
        </BarButton>
      }
    >
      <Section header="File Name" footer="Saved as a PDF. Today's date is used if you leave it empty.">
        <div className={s.nameRow}>
          <input
            className={s.name}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
            onFocus={(e) => e.target.select()}
            aria-label="File name"
            maxLength={120}
            enterKeyHint="done"
          />
          <span className={s.ext}>.pdf</span>
        </div>
      </Section>

      <Section header="Output Size" footer={SIZE_HELP[size]}>
        <div className={s.pad}>
          <Segmented<OutputSize>
            label="Output size"
            value={size}
            onChange={setSize}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'small', label: 'Small' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {size === 'custom' ? (
          <label className={s.target}>
            <span>Keep under</span>
            <input inputMode="decimal" value={targetMb} onChange={(e) => setTargetMb(e.target.value)} aria-label="Size limit in MB" />
            <span className={s.unit}>MB</span>
          </label>
        ) : (
          <Cell title="Estimated Size" detail={estimate === null ? <Spinner size={16} /> : `About ${formatBytes(estimate)}`} />
        )}
      </Section>

      {hasImages && (
        <Section header="Photo Pages" footer="PDF pages always keep their own size.">
          <div className={s.pad}>
            <Segmented<PageSize>
              label="Page size"
              value={pageSize}
              onChange={setPageSize}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
                { value: 'fit', label: 'Fit to Photo' },
              ]}
            />
          </div>
          <Cell title="White Margins" accessory={<Switch checked={margins} onChange={setMargins} label="White margins" />} />
        </Section>
      )}

      {hasPdf && pdfCompressAllowed && (
        <Section footer="Makes PDF pages smaller by turning them into images. Text in those pages won't be selectable anymore.">
          <Cell title="Compress PDF Pages Too" accessory={<Switch checked={compressPdf} onChange={setCompressPdf} label="Compress PDF pages too" />} />
        </Section>
      )}

      <div className={s.actions}>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {result?.note && <p className={s.note}>{result.note}</p>}
        {busy ? (
          <div className={s.progress} role="status">
            <Spinner size={20} />
            <span>{progress}</span>
          </div>
        ) : (
          <>
            <Button icon={<DownloadSimpleIcon size={20} weight="bold" />} onClick={save}>
              Save PDF
            </Button>
            {canShare && (
              <Button variant="tinted" icon={<ShareNetworkIcon size={20} weight="bold" />} onClick={share}>
                Share
              </Button>
            )}
          </>
        )}
        {result && !busy && <p className={s.done}>Ready: {result.file.name}, {formatBytes(result.file.size)}</p>}
      </div>
    </Sheet>
  );
}
