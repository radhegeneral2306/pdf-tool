import { useEffect } from 'react';
import { useRoute } from './router';
import { useApplyTheme } from './theme/useTheme';
import { useSettings } from './storage/settings';
import { TabBar } from './components/TabBar';
import { ToastHost, hideToast } from './components/Toast';
import { HudHost } from './components/Hud';
import { UpdateBanner } from './components/UpdateBanner';
import { Tools } from './screens/Tools';
import { Documents } from './screens/Documents';
import { Settings } from './screens/Settings';
import { DocumentView } from './screens/DocumentView';
import { Camera } from './screens/Camera';
import { PageEditor } from './screens/PageEditor';
import { Welcome } from './screens/Welcome';
import { handleOpenRoute } from './lib/openWith';

export function App() {
  useApplyTheme();
  const route = useRoute();
  const { welcomed } = useSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
    if (route.name === 'open') handleOpenRoute();
  }, [route.name]);

  // Messages belong to the screen they were shown on. Keep them when a page editor opens
  // over its document (e.g. "Page deleted, Undo"), clear them when going somewhere else.
  const place = route.name === 'edit' || route.name === 'doc' ? `doc:${route.id}` : route.name;
  useEffect(() => hideToast(), [place]);

  const tab = route.name === 'tools' || route.name === 'documents' || route.name === 'settings';

  return (
    <>
      {route.name === 'tools' && <Tools />}
      {route.name === 'documents' && <Documents />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'scan' && <Camera />}
      {route.name === 'doc' && <DocumentView key={route.id} id={route.id} startSelecting={route.select} />}
      {route.name === 'camera' && <Camera projectId={route.id} />}
      {route.name === 'edit' && (
        <>
          <DocumentView key={route.id} id={route.id} />
          <PageEditor key={route.pageId} projectId={route.id} pageId={route.pageId} />
        </>
      )}
      {tab && <TabBar active={route.name} />}
      {!welcomed && <Welcome />}
      <ToastHost />
      <HudHost />
      <UpdateBanner />
    </>
  );
}
