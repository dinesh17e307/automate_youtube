import { useEffect, useState } from 'react';
import { api, type ChannelConfig } from '../api';

const CATEGORIES = [
  'nursery_rhymes', 'kids_songs', 'educational_rhymes', 'alphabet_learning',
  'numbers_counting', 'colors', 'shapes', 'animals', 'fruits_vegetables',
  'good_habits', 'moral_stories', 'simple_science', 'general_knowledge',
  'action_songs', 'bedtime_stories', 'festival_seasonal',
];

export default function Settings() {
  const [config, setConfig] = useState<ChannelConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [youtubeStatus, setYoutubeStatus] = useState<{
    configured: boolean;
    authenticated: boolean;
    redirectUri?: string;
    setupHint?: string;
  } | null>(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
    api.getYouTubeStatus().then(setYoutubeStatus).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await api.updateConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleYouTubeConnect = async () => {
    try {
      const { authUrl } = await api.getYouTubeAuth();
      window.open(authUrl, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCategory = (cat: string) => {
    if (!config) return;
    const cats = config.contentCategories.includes(cat)
      ? config.contentCategories.filter((c) => c !== cat)
      : [...config.contentCategories, cat];
    setConfig({ ...config, contentCategories: cats });
  };

  if (!config) {
    return <div className="text-white text-center py-20 animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-extrabold text-white">Settings</h2>
        <p className="text-white/70 mt-1">Configure your automated content pipeline</p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <Section title="Channel">
          <Field label="Channel Name" value={config.channelName} onChange={(v) => setConfig({ ...config, channelName: v })} />
          <Field label="Target Age" value={config.targetAge} onChange={(v) => setConfig({ ...config, targetAge: v })} placeholder="2-6" />
          <Field label="Language" value={config.language} onChange={(v) => setConfig({ ...config, language: v })} />
        </Section>

        <Section title="Schedule">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Long Video Time (UTC)" value={config.longVideoTime} onChange={(v) => setConfig({ ...config, longVideoTime: v })} placeholder="18:00" />
            <Field label="Short Time (UTC)" value={config.shortVideoTime} onChange={(v) => setConfig({ ...config, shortVideoTime: v })} placeholder="20:00" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min Duration (sec)" value={String(config.videoDurationMin)} onChange={(v) => setConfig({ ...config, videoDurationMin: parseInt(v) || 120 })} type="number" />
            <Field label="Max Duration (sec)" value={String(config.videoDurationMax)} onChange={(v) => setConfig({ ...config, videoDurationMax: parseInt(v) || 300 })} type="number" />
          </div>
        </Section>

        <Section title="Content Categories">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  config.contentCategories.includes(cat)
                    ? 'bg-purple-100 text-purple-700 ring-2 ring-purple-300'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Style">
          <Field label="Visual Style" value={config.visualStyle} onChange={(v) => setConfig({ ...config, visualStyle: v })} />
          <Field label="Voice Style" value={config.voiceStyle} onChange={(v) => setConfig({ ...config, voiceStyle: v })} />
        </Section>

        <Section title="Automation">
          <div className="flex gap-4">
            {['fully_automatic', 'approval'].map((mode) => (
              <button
                key={mode}
                onClick={() => setConfig({ ...config, automationMode: mode })}
                className={`flex-1 p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  config.automationMode === mode
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {mode === 'fully_automatic' ? '⚡ Fully Automatic' : '👁 Approval Mode'}
              </button>
            ))}
          </div>
        </Section>

        <Section title="AI Providers">
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="LLM" value={config.llmProvider} options={['openai', 'mock']} onChange={(v) => setConfig({ ...config, llmProvider: v })} />
            <SelectField label="Image" value={config.imageProvider} options={['openai', 'mock']} onChange={(v) => setConfig({ ...config, imageProvider: v })} />
            <SelectField label="TTS" value={config.ttsProvider} options={['openai', 'mock']} onChange={(v) => setConfig({ ...config, ttsProvider: v })} />
            <SelectField label="Music" value={config.musicProvider} options={['mock']} onChange={(v) => setConfig({ ...config, musicProvider: v })} />
          </div>
        </Section>

        <Section title="YouTube Integration">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-700 text-sm">
                {youtubeStatus?.authenticated ? '✅ Connected' : '❌ Not Connected'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {youtubeStatus?.configured
                  ? 'YouTube API credentials configured'
                  : 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET on Render'}
              </p>
            </div>
            {youtubeStatus?.configured && !youtubeStatus.authenticated && (
              <button
                onClick={handleYouTubeConnect}
                className="px-4 py-2 bg-red-500 text-white font-bold rounded-xl text-sm hover:bg-red-600 transition-colors"
              >
                Connect YouTube
              </button>
            )}
          </div>

          {youtubeStatus?.redirectUri && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
              <p className="font-bold text-yellow-800 mb-2">Google Cloud setup required</p>
              <p className="text-yellow-700 text-xs mb-2">
                Add this <strong>exact</strong> redirect URI in Google Cloud Console:
              </p>
              <code className="block bg-white p-2 rounded text-xs break-all text-gray-800 border">
                {youtubeStatus.redirectUri}
              </code>
              <ol className="text-xs text-yellow-700 mt-3 space-y-1 list-decimal list-inside">
                <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline">Google Cloud Credentials</a></li>
                <li>Open your OAuth 2.0 Client ID</li>
                <li>Under <strong>Authorized redirect URIs</strong>, click Add URI and paste the URL above</li>
                <li>Enable <strong>YouTube Data API v3</strong> in the API Library</li>
                <li>Add your Google account as a <strong>Test user</strong> on the OAuth consent screen (if app is in Testing mode)</li>
                <li>Save, wait 1–2 minutes, then click Connect YouTube again</li>
              </ol>
            </div>
          )}
        </Section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-400 uppercase mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
