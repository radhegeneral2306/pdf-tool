import { useEffect, useState } from 'react';
import { DeviceMobileIcon, LockSimpleIcon, TrashIcon, WifiSlashIcon, CheckIcon } from '@phosphor-icons/react';
import { NavBar } from '../components/NavBar';
import { Cell, Section } from '../components/List';
import { Segmented } from '../components/Controls';
import { ActionSheet, Sheet } from '../components/Sheet';
import { BarButton } from '../components/NavBar';
import { showToast } from '../components/Toast';
import { updateSettings, useSettings } from '../storage/settings';
import { clearAll, storageUsage } from '../storage/db';
import { forgetProject, useProjectList } from '../storage/projects';
import { formatBytes } from '../lib/compress';
import { isIOS, isStandalone, promptInstall, useCanPrompt } from '../lib/install';
import { FILTERS } from '../lib/filterMeta';
import type { FilterId, OutputSize, PageSize, ThemePref } from '../types';
import s from './Settings.module.css';

export function Settings() {
  const st = useSettings();
  const projects = useProjectList();
  const canPrompt = useCanPrompt();
  const [usage, setUsage] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [filterPicker, setFilterPicker] = useState(false);
  const installed = isStandalone();

  useEffect(() => {
    storageUsage().then(setUsage);
  }, [projects]);

  const install = async () => {
    if (canPrompt) await promptInstall();
    else if (isIOS()) setIosHelp(true);
    else showToast('Open your browser menu and choose "Install app" or "Add to Home screen".');
  };

  return (
    <main className={s.screen}>
      <NavBar large title="Settings" />

      <Section header="Appearance">
        <div className={s.pad}>
          <Segmented<ThemePref>
            label="Appearance"
            value={st.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: 'Automatic' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </Section>

      <Section header="Defaults" footer="Original keeps every photo at full quality. You can still pick a smaller size each time you export.">
        <Cell title="Filter for New Scans" detail={FILTERS.find((f) => f.id === st.scanFilter)?.label} chevron onClick={() => setFilterPicker(true)} />
        <div className={s.row}>
          <span>Page Size</span>
          <Segmented<PageSize>
            label="Default page size"
            value={st.pageSize}
            onChange={(pageSize) => updateSettings({ pageSize })}
            options={[
              { value: 'a4', label: 'A4' },
              { value: 'letter', label: 'Letter' },
              { value: 'fit', label: 'Fit' },
            ]}
          />
        </div>
        <div className={s.stack}>
          <span>Output Size</span>
          <Segmented<OutputSize>
            label="Default output size"
            value={st.outputSize === 'custom' ? 'original' : st.outputSize}
            onChange={(outputSize) => updateSettings({ outputSize })}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'small', label: 'Small' },
            ]}
          />
        </div>
      </Section>

      <Section header="App" footer={installed ? 'PDF Tool is installed on this device.' : 'Install to open PDF Tool from your home screen, even offline.'}>
        <Cell
          icon={<DeviceMobileIcon size={19} weight="fill" />}
          iconBg="#007AFF"
          title={installed ? 'Installed' : 'Install App'}
          tint={!installed}
          onClick={installed ? undefined : install}
          accessory={installed ? <CheckIcon size={18} weight="bold" color="var(--success)" /> : undefined}
        />
      </Section>

      <Section
        header="Storage"
        footer="Browsers may clear saved data if the app is not used for a long time. Export important PDFs to keep them safe."
      >
        <Cell title="Used on This Device" detail={usage === null ? 'Unknown' : formatBytes(usage)} />
        <Cell
          icon={<TrashIcon size={19} weight="fill" />}
          iconBg="#FF3B30"
          title="Delete All Documents"
          destructive
          onClick={() => setConfirmClear(true)}
        />
      </Section>

      <Section header="Privacy">
        <Cell icon={<LockSimpleIcon size={19} weight="fill" />} iconBg="#34C759" title="Files never leave your device" />
        <Cell icon={<WifiSlashIcon size={19} weight="bold" />} iconBg="#8E8E93" title="Works without internet" />
      </Section>

      <p className={s.version}>PDF Tool 1.0</p>

      <ActionSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="All documents and their files will be deleted from this device."
        actions={[
          {
            label: 'Delete All',
            destructive: true,
            onSelect: async () => {
              await clearAll();
              projects?.forEach((p) => forgetProject(p.id));
              showToast('All documents deleted');
            },
          },
        ]}
      />

      <ActionSheet
        open={filterPicker}
        onClose={() => setFilterPicker(false)}
        title="Filter for New Scans"
        actions={FILTERS.map((f) => ({
          label: f.id === st.scanFilter ? `${f.label} (current)` : f.label,
          onSelect: () => updateSettings({ scanFilter: f.id as FilterId }),
        }))}
      />

      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Install on iPhone" right={<BarButton bold onClick={() => setIosHelp(false)}>Done</BarButton>}>
        <ol className={s.steps}>
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap the <strong>Share</strong> button at the bottom of the screen.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>. PDF Tool now opens like a normal app.
          </li>
        </ol>
      </Sheet>
    </main>
  );
}
