import { useEffect, useState } from 'react';
import { DEFAULT_PREFERENCES, type NexusPreferences } from '../domain/models';
import { loadPreferences, savePreferences } from '../storage/db';
import { compactBytes } from '../utils/fileTypes';

export function SettingsPage() {
  const [preferences, setPreferences] = useState<NexusPreferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState('');

  useEffect(() => { void loadPreferences().then(setPreferences); }, []);

  async function update<K extends keyof NexusPreferences>(key: K, value: NexusPreferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    await savePreferences(next);
    setStatus('Saved locally');
    window.setTimeout(() => setStatus(''), 1200);
  }

  return <main className="page"><div className="page-title"><div><p>SETTINGS</p><h1>NEXUS Preferences</h1><span>Only settings that affect real behavior are exposed.</span></div><small className="save-status">{status}</small></div><section className="settings-layout"><aside className="settings-nav"><div className="settings-nav-label active">Analysis & Graphics</div></aside><article className="panel settings-panel"><h2>Analysis</h2><label><span>Maximum text-file read size<small>Files above this remain indexed but their contents are not read.</small></span><select value={preferences.maxTextFileBytes} onChange={(e) => void update('maxTextFileBytes', Number(e.target.value))}><option value={1024 * 1024}>1 MB</option><option value={2 * 1024 * 1024}>2 MB</option><option value={5 * 1024 * 1024}>5 MB</option></select></label><div className="settings-value">Current limit: {compactBytes(preferences.maxTextFileBytes)}</div><label><span>Reduced visual effects<small>Use calmer rendering on weaker GPUs or when motion is distracting.</small></span><input type="checkbox" checked={preferences.reducedEffects} onChange={(e) => void update('reducedEffects', e.target.checked)}/></label><p className="settings-note">The 50,000-entry safety limit and hard generated-folder exclusions are intentionally not exposed as casual theme-style toggles in this foundation.</p></article></section></main>;
}
