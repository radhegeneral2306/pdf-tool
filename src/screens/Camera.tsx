import { useEffect, useRef, useState } from 'react';
import { CameraIcon, LightningIcon, LightningSlashIcon, ImagesIcon } from '@phosphor-icons/react';
import { ActionSheet } from '../components/Sheet';
import { withBusy } from '../components/Hud';
import { goBack, navigate } from '../router';
import { newProject, updateProject } from '../storage/projects';
import { getSettings } from '../storage/settings';
import { importFiles } from '../lib/importFiles';
import { pickFiles, ACCEPT_IMAGES } from '../lib/pickFiles';
import { canvasToBlob, freeCanvas } from '../lib/imageUtils';
import { showToast } from '../components/Toast';
import { dateName } from '../lib/fileName';
import s from './Camera.module.css';

type CamState = 'starting' | 'live' | 'denied' | 'unavailable';

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined;

/** Batch document camera. `projectId` adds to an existing document, otherwise a new one is made. */
export function Camera({ projectId }: { projectId?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('starting');
  const [shots, setShots] = useState<{ blob: Blob; url: string }[]>([]);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      try {
        const st = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } },
        });
        if (cancelled) {
          st.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = st;
        const v = video.current!;
        v.srcObject = st;
        await v.play().catch(() => {});
        const caps = (st.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        setState('live');
      } catch (e) {
        if (!cancelled) setState(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((sh) => URL.revokeObjectURL(sh.url)), []);

  const addShot = (blob: Blob) => {
    setShots((cur) => [...cur, { blob, url: URL.createObjectURL(blob) }]);
  };

  const capture = async () => {
    const v = video.current;
    const track = stream.current?.getVideoTracks()[0];
    if (!v || !track || capturing) return;
    setCapturing(true);
    setFlash((f) => f + 1);
    navigator.vibrate?.(15);
    try {
      let blob: Blob | null = null;
      // Full sensor resolution where supported (Android Chrome).
      if (typeof ImageCapture !== 'undefined') {
        try {
          blob = await new ImageCapture(track).takePhoto();
        } catch {
          blob = null;
        }
      }
      if (!blob) {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')!.drawImage(v, 0, 0);
        blob = await canvasToBlob(c, 'image/jpeg', 0.95);
        freeCanvas(c);
      }
      addShot(blob);
    } finally {
      setCapturing(false);
    }
  };

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const nativeCamera = () => {
    pickFiles(ACCEPT_IMAGES, { capture: true, multiple: false }).then((files) => files.forEach(addShot));
  };
  const library = () => {
    pickFiles(ACCEPT_IMAGES).then((files) => files.forEach(addShot));
  };

  const done = async () => {
    if (!shots.length) return;
    stream.current?.getTracks().forEach((t) => t.stop());
    await withBusy('Saving scans', async () => {
      const { pages, errors } = await importFiles(
        shots.map((sh) => sh.blob),
        getSettings().scanFilter,
      );
      if (errors.length) showToast(errors[0]);
      if (!pages.length) return;
      let id = projectId;
      if (id) updateProject(id, (p) => ({ ...p, pages: [...p.pages, ...pages] }));
      else id = newProject(pages, `Scan ${dateName()}`).id;
      navigate(`/doc/${id}`, { replace: true });
      navigate(`/doc/${id}/edit/${pages[0].id}`);
    });
  };

  const cancel = () => (shots.length ? setConfirmCancel(true) : goBack(projectId ? `/doc/${projectId}` : '/'));
  const last = shots[shots.length - 1];

  return (
    <div className={s.camera}>
      <header className={s.top}>
        <button className={s.textBtn} onClick={cancel}>
          Cancel
        </button>
        {torch !== null && (
          <button className={`${s.iconBtn} ${torch ? s.torchOn : ''}`} onClick={toggleTorch} aria-label={torch ? 'Turn flash off' : 'Turn flash on'}>
            {torch ? <LightningIcon size={22} weight="fill" /> : <LightningSlashIcon size={22} />}
          </button>
        )}
        <button className={s.textBtn} onClick={nativeCamera}>
          Phone Camera
        </button>
      </header>

      <div className={s.viewport}>
        <video ref={video} className={s.video} playsInline muted autoPlay />
        {state === 'live' && <div className={s.guide} aria-hidden />}
        {flash > 0 && <div key={flash} className={s.flash} aria-hidden />}
        {(state === 'denied' || state === 'unavailable') && (
          <div className={s.message}>
            <CameraIcon size={48} weight="thin" />
            <h2>{state === 'denied' ? 'Camera Access Needed' : 'Camera Not Available'}</h2>
            <p>
              {state === 'denied'
                ? 'Allow camera access in your browser settings, or use the phone camera app instead.'
                : 'Use your phone camera app instead. It also gives the best photo quality.'}
            </p>
            <button className={s.pill} onClick={nativeCamera}>
              Use Phone Camera
            </button>
            <button className={s.textBtn} onClick={library}>
              Choose from Photos
            </button>
          </div>
        )}
        {state === 'starting' && <p className={s.starting}>Starting camera</p>}
      </div>

      <footer className={s.bottom}>
        <div className={s.slot}>
          {last ? (
            <span className={s.stack}>
              <img src={last.url} alt="" />
              <span className={s.count}>{shots.length}</span>
            </span>
          ) : (
            <button className={s.iconBtn} onClick={library} aria-label="Choose from Photos">
              <ImagesIcon size={28} />
            </button>
          )}
        </div>
        <button className={s.shutter} onClick={capture} disabled={state !== 'live' || capturing} aria-label="Take photo">
          <span />
        </button>
        <div className={`${s.slot} ${s.right}`}>
          <button className={`${s.textBtn} ${s.done}`} onClick={done} disabled={!shots.length}>
            {shots.length ? `Done (${shots.length})` : 'Done'}
          </button>
        </div>
      </footer>

      <ActionSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={`Discard ${shots.length} ${shots.length === 1 ? 'photo' : 'photos'}?`}
        actions={[{ label: 'Discard Photos', destructive: true, onSelect: () => goBack(projectId ? `/doc/${projectId}` : '/') }]}
      />
    </div>
  );
}
