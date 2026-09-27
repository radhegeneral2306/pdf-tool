import { useEffect } from 'react';
import { useRoute } from './router';
import { useApplyTheme } from './theme/useTheme';
import { useSettings } from './storage/settings';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/Toast';
import { HudHost } from './components/Hud';
import { UpdateBanner } from './components/UpdateBanner';
import { Tools } from './screens/Tools';
import { Documents } from './screens/Documents';
import { Settings } from './screens/Settings';
import { DocumentView } from './screens/DocumentView';
import { Camera } from './screens/Camera';
import { PageEditor } from './screens/PageEditor';
import { Welcome } from './screens/Welcome';

export function App() {
  useApplyTheme();
  const route = useRoute();
  const { welcomed } = useSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  const tab = route.name === 'tools' || route.name === 'documents' || route.name === 'settings';

  return (
    <>
      {route.name === 'tools' && <Tools />}
      {route.name === 'documents' && <Documents />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'scan' && <Camera />}
      {route.name === 'doc' && <DocumentView key={route.id} id={route.id} />}
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
