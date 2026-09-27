import { useEffect, useRef, useState } from 'react';
import { CameraIcon, LightningIcon, LightningSlashIcon, ImagesIcon } from '@phosphor-icons/react';
import { ActionSheet } from '../components/Sheet';
import { withBusy } from '../components/Hud';
import { goBack, navigate } from '../router';
import { newProject, updateProject, useProject } from '../storage/projects';
import { getSettings } from '../storage/settings';
import { importFiles } from '../lib/importFiles';
import { pickFiles, ACCEPT_IMAGES } from '../lib/pickFiles';
import { canvasToBlob, freeCanvas } from '../lib/imageUtils';
import { showToast } from '../components/Toast';
import { dateName } from '../lib/fileName';
import { detectInBlob, detectQuad, warmUp, type Detection } from '../lib/edgeDetect';
import { quadDistance } from '../lib/quad';
import type { Quad } from '../types';
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
  const [shots, setShots] = useState<{ blob: Blob; url: string; edges: Promise<Detection | null> }[]>([]);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [capturing, setCapturing] = useState(false);
  useProject(projectId); // load the document early, in case the app was reloaded on this screen
  const [cv, setCv] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);

  // Opening the scanner is the only place OpenCV starts downloading (never on app start).
  useEffect(() => {
    let alive = true;
    warmUp().then((ok) => {
      if (!alive) return;
      setCv(ok ? 'ready' : 'failed');
      if (!ok) showToast('Auto edge detection needs internet the first time. You can still crop by hand.');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Live page outline on the preview. Small frames, only when the detector is idle,
  // slower when the phone is slow, paused when the app is in the background.
  useEffect(() => {
    if (cv !== 'ready' || state !== 'live') return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let interval = 400;
    let last: Quad | null = null;
    const tick = async () => {
      if (stop) return;
      const v = video.current;
      if (v && !document.hidden && v.videoWidth) {
        const r = await detectQuad(v, 320);
        if (stop) return;
        if (r) interval = r.ms > 120 ? 800 : 400;
        const q = r?.quad ?? null;
        if (!q || !last || quadDistance(q, last) > 0.02) {
          last = q;
          setLiveQuad(q);
        }
      }
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [cv, state]);

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
    // Find the page edges right away in the background, while the user keeps shooting.
    const edges = detectInBlob(blob).catch(() => null);
    setShots((cur) => [...cur, { blob, url: URL.createObjectURL(blob), edges }]);
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
        if (!v.videoWidth) throw new Error('Camera not ready');
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')!.drawImage(v, 0, 0);
        blob = await canvasToBlob(c, 'image/jpeg', 0.95);
        freeCanvas(c);
      }
      addShot(blob);
    } catch {
      showToast("Couldn't take the photo. Try again, or use Phone Camera.");
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
    await withBusy('Finding page edges', async () => {
      const found = await Promise.all(shots.map((sh) => sh.edges));
      const { pages, errors } = await importFiles(
        shots.map((sh) => sh.blob),
        getSettings().scanFilter,
      );
      if (errors.length) showToast(errors[0]);
      if (!pages.length) return;
      // Pre-place the crop corners on the detected page edges.
      if (pages.length === shots.length) found.forEach((d, i) => d && (pages[i].crop = d.quad));
      const missed = found.filter((d) => !d).length;
      if (!errors.length && cv === 'ready' && missed)
        showToast(
          missed === shots.length && shots.length === 1
            ? "Couldn't find the page edges. Adjust the corners by hand."
            : `Couldn't find edges on ${missed} of ${shots.length} photos. Adjust those corners by hand.`,
        );
      stream.current?.getTracks().forEach((t) => t.stop());
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
        {state === 'live' && (liveQuad ? <LiveOutline video={video.current} quad={liveQuad} /> : <div className={s.guide} aria-hidden />)}
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

/** Draws the detected page outline over the camera preview (video uses object-fit: contain). */
function LiveOutline({ video, quad }: { video: HTMLVideoElement | null; quad: Quad }) {
  if (!video || !video.videoWidth) return null;
  const bw = video.clientWidth;
  const bh = video.clientHeight;
  const k = Math.min(bw / video.videoWidth, bh / video.videoHeight);
  const w = video.videoWidth * k;
  const h = video.videoHeight * k;
  const ox = (bw - w) / 2;
  const oy = (bh - h) / 2;
  const pts = quad.map((p) => `${ox + p.x * w},${oy + p.y * h}`).join(' ');
  return (
    <svg className={s.outline} width={bw} height={bh} aria-hidden>
      <polygon points={pts} />
    </svg>
  );
}
