import { useState } from 'react';
import { PROVIDERS, saveConfig } from '@/lib/settings';
import type { Config, ProviderId } from '@/lib/types';

export default function Settings(props: {
  config: Config;
  onChange: (c: Config) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<Config>(props.config);
  const [saved, setSaved] = useState(false);
  const p = cfg.profiles[cfg.provider];
  const preset = PROVIDERS[cfg.provider];

  const setProfile = (patch: Partial<typeof p>) =>
    setCfg({ ...cfg, profiles: { ...cfg.profiles, [cfg.provider]: { ...p, ...patch } } });

  return (
    <div className="settings">
      <div className="settings-header">
        <div className="settings-title-group">
          <h3>NEXUS TAB CONFIGURATION</h3>
          <span className="settings-badge">SYSTEM CONTROLS</span>
        </div>
        <button className="icon close-btn" onClick={props.onClose} title="Close Configuration">
          ✕
        </button>
      </div>

      <div className="settings-card">
        <label>
          <span className="label-text">INTELLIGENCE PROVIDER</span>
          <select
            value={cfg.provider}
            onChange={(e) => setCfg({ ...cfg, provider: e.target.value as ProviderId })}
          >
            {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label-text">MODEL DESIGNATION</span>
          <input value={p.model} onChange={(e) => setProfile({ model: e.target.value })} />
        </label>

        <label>
          <span className="label-text">API ACCESS TOKEN {preset.needsKey ? '' : '(NOT REQUIRED)'}</span>
          <input
            type="password"
            value={p.apiKey}
            placeholder={preset.needsKey ? 'Paste key from provider dashboard' : 'Optional / Not required'}
            onChange={(e) => setProfile({ apiKey: e.target.value })}
          />
          <small className="setting-hint">{preset.hint}</small>
        </label>

        <label>
          <span className="label-text">ENDPOINT BASE URL</span>
          <input value={p.baseUrl} onChange={(e) => setProfile({ baseUrl: e.target.value })} />
        </label>
      </div>

      <div className="settings-card">
        <span className="card-heading">TACTICAL PROTOCOLS & GOVERNANCE</span>
        <label className="row checkbox-row">
          <input
            type="checkbox"
            checked={cfg.requireApproval}
            onChange={(e) => setCfg({ ...cfg, requireApproval: e.target.checked })}
          />
          <span>Require manual authorization before high-impact actions (purchases, deletions, submissions)</span>
        </label>

        <label>
          <span className="label-text">MAX AUTONOMOUS ACTIONS PER DIRECTIVE</span>
          <input
            type="number"
            min={1}
            max={50}
            value={cfg.maxSteps}
            onChange={(e) =>
              setCfg({ ...cfg, maxSteps: Math.max(1, Math.min(50, Number(e.target.value) || 15)) })
            }
          />
          <small className="setting-hint">Caps the number of iterative DOM actions per execution loop</small>
        </label>
      </div>

      <p className="note">
        🛡 Secure Local Storage: Credentials remain isolated within your browser's encrypted storage and connect only directly to your selected API endpoint.
      </p>

      <div className="settings-actions">
        <button
          className="primary save-btn"
          onClick={async () => {
            await saveConfig(cfg);
            props.onChange(cfg);
            setSaved(true);
            setTimeout(() => props.onClose(), 600);
          }}
        >
          {saved ? '✓ PROTOCOL SAVED' : 'SAVE CONFIGURATION'}
        </button>
        <button className="secondary" onClick={props.onClose}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
