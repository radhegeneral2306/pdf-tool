import { CameraIcon, FilePdfIcon, ImagesIcon, MoonIcon, StackIcon, SunIcon, ScanIcon, CaretRightIcon, ScissorsIcon, PencilSimpleIcon, TextAaIcon } from '@phosphor-icons/react';
import { NavBar, BarButton } from '../components/NavBar';
import { Cell, Section } from '../components/List';
import { DocThumb } from '../components/DocThumb';
import { withBusy } from '../components/Hud';
import { navigate } from '../router';
import { useProjectList } from '../storage/projects';
import { updateSettings } from '../storage/settings';
import { useIsDark } from '../theme/useTheme';
import { ACCEPT_ANY, ACCEPT_IMAGES, ACCEPT_PDF, pickFiles } from '../lib/pickFiles';
import { createFromFiles } from '../lib/importFlow';
import { useFileDrop } from '../lib/dropFiles';
import { openFiles } from '../lib/openWith';
import { dateName } from '../lib/fileName';
import { dateLabel, pagesLabel } from '../lib/format';
import s from './Tools.module.css';

function start(accept: string, prefix: string) {
  // pickFiles must run synchronously inside the tap.
  pickFiles(accept).then((files) => {
    if (files.length) withBusy('Adding files', () => createFromFiles(files, `${prefix} ${dateName()}`));
  });
}

export function Tools() {
  const projects = useProjectList();
  const recent = projects?.slice(0, 3) ?? [];
  const dark = useIsDark();
  const drop = useFileDrop((files) => withBusy('Adding files', () => createFromFiles(files, `Combined ${dateName()}`)));

  return (
    <main className={`${s.screen} ${drop.over ? s.dropping : ''}`} {...drop.props}>
      <NavBar
        large
        title="PDF Tool"
        right={
          <BarButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}>
            {dark ? <SunIcon size={24} /> : <MoonIcon size={24} />}
          </BarButton>
        }
      />

      <button className={s.scan} onClick={() => navigate('/scan')}>
        <span className={s.scanIcon}>
          <ScanIcon size={34} weight="regular" />
        </span>
        <span className={s.scanText}>
          <strong>Scan Document</strong>
          <span>Take photos, get a clean PDF</span>
        </span>
        <CameraIcon size={24} className={s.scanCam} />
      </button>

      <Section header="Create">
        <Cell
          icon={<ImagesIcon size={19} weight="fill" />}
          iconBg="#34C759"
          title="Images to PDF"
          subtitle="Turn photos into one PDF"
          chevron
          onClick={() => start(ACCEPT_IMAGES, 'Images')}
        />
        <Cell
          icon={<FilePdfIcon size={19} weight="fill" />}
          iconBg="#FF3B30"
          title="Merge PDFs"
          subtitle="Join several PDFs into one"
          chevron
          onClick={() => start(ACCEPT_PDF, 'Merged')}
        />
        <Cell
          icon={<PencilSimpleIcon size={19} weight="fill" />}
          iconBg="#5856D6"
          title="Edit PDF"
          subtitle="Rotate, reorder, add or remove pages"
          chevron
          onClick={() => pickFiles(ACCEPT_PDF, { multiple: false }).then((files) => openFiles(files))}
        />
        <Cell
          icon={<ScissorsIcon size={19} weight="fill" />}
          iconBg="#AF52DE"
          title="Split PDF"
          subtitle="Pick pages from one or more PDFs"
          chevron
          onClick={() =>
            pickFiles(ACCEPT_PDF, { multiple: true }).then((files) => {
              if (files.length) withBusy('Opening PDF', () => createFromFiles(files, `Split ${dateName()}`, { select: true }));
            })
          }
        />
        <Cell
          icon={<TextAaIcon size={19} weight="bold" />}
          iconBg="#30B0C7"
          title="Extract Text (OCR)"
          subtitle="Read text from photos and PDFs"
          chevron
          onClick={() => navigate('/ocr')}
        />
        <Cell
          icon={<StackIcon size={19} weight="fill" />}
          iconBg="#FF9500"
          title="Combine Files"
          subtitle="Mix PDFs and photos together"
          chevron
          onClick={() => start(ACCEPT_ANY, 'Combined')}
        />
      </Section>

      {recent.length > 0 && (
        <section className={s.recent}>
          <div className={s.recentHead}>
            <h2>Recent</h2>
            <button onClick={() => navigate('/documents', { replace: true })}>
              See All <CaretRightIcon size={13} weight="bold" />
            </button>
          </div>
          <div className={s.recentGroup}>
            {recent.map((p) => (
              <Cell
                key={p.id}
                leading={<DocThumb page={p.pages[0]} />}
                title={p.title}
                subtitle={`${pagesLabel(p.pages.length)}, ${dateLabel(p.updatedAt)}`}
                chevron
                onClick={() => navigate(`/doc/${p.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      <p className={s.privacy}>Your files stay on this device. Nothing is uploaded.</p>
    </main>
  );
}
