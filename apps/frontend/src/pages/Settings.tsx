import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ChannelConfig, type SystemStatus, type YouTubeStatus } from '../api';

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
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeStatus | null>(null);

  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadSystemStatus = () => {
    setStatusLoading(true);
    api.getSystemStatus()
      .then(setSystemStatus)
      .catch(console.error)
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    api.getConfig().then(setConfig).catch(console.error);
    api.getYouTubeStatus().then(setYoutubeStatus).catch(console.error);
    loadSystemStatus();
    const interval = setInterval(loadSystemStatus, 30000);

    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube') === 'connected') {
      setYoutubeConnected(true);
      api.getYouTubeStatus().then(setYoutubeStatus).catch(console.error);
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('youtube') === 'error') {
      setYoutubeError(decodeURIComponent(params.get('message') || 'Connection failed'));
      window.history.replaceState({}, '', '/settings');
    }

    return () => clearInterval(interval);
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
      window.location.href = authUrl;
    } catch (err) {
      console.error(err);
      setYoutubeError(err instanceof Error ? err.message : 'Failed to start OAuth');
    }
  };

  const handleRetryThumbnails = async () => {
    try {
      const status = await api.resetYouTubeThumbnailBlock();
      setYoutubeStatus(status);
      loadSystemStatus();
    } catch (err) {
      console.error(err);
      setYoutubeError(err instanceof Error ? err.message : 'Failed to reset thumbnail block');
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
        <Section title="System Status & Limits">
          {statusLoading && !systemStatus ? (
            <p className="text-sm text-gray-400">Checking status...</p>
          ) : systemStatus ? (
            <div className="space-y-4">
              {/* YouTube */}
              <StatusCard
                title="YouTube"
                status={
                  systemStatus.youtube.status === 'ok' ? 'ok'
                    : systemStatus.youtube.status === 'warning' ? 'error'
                    : systemStatus.youtube.status === 'not_connected' ? 'not_configured'
                    : 'not_configured'
                }
                message={systemStatus.youtube.message}
                detail={systemStatus.youtube.customThumbnailsNote}
                link="https://studio.youtube.com/channel/UC/features"
                linkLabel="Verify channel for custom thumbnails"
              />

              {/* OpenAI */}
              <StatusCard
                title="LLM Provider"
                status={systemStatus.openai.status}
                message={systemStatus.openai.message}
                detail={systemStatus.openai.limitsNote}
                link={systemStatus.openai.usageUrl}
                linkLabel={systemStatus.openai.activeProvider === 'gemini' ? 'Get Gemini API key' : systemStatus.openai.activeProvider === 'openai' ? 'View OpenAI usage' : 'Get free Gemini key'}
              />

              {/* Hosting */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniStat label="Hosting" value={systemStatus.hosting.freeTier ? 'Render Free ($0)' : 'Paid'} />
                <MiniStat label="Memory" value={systemStatus.hosting.memoryLimit} />
                <MiniStat label="LLM Provider" value={systemStatus.openai.activeProvider} />
                <MiniStat label="Cron jobs" value={systemStatus.hosting.cronConfigured ? '✅ Configured' : '❌ Not set'} />
              </div>

              {/* Free tier limits */}
              {systemStatus.hosting.freeTier && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                  <p className="font-bold mb-1">Free tier video limits</p>
                  <p>Max {systemStatus.freeTierLimits.maxVideoSeconds}s · {systemStatus.freeTierLimits.maxScenes} scenes · {systemStatus.freeTierLimits.renderResolution} · {systemStatus.freeTierLimits.renderTimeoutSeconds}s render timeout</p>
                  <p className="mt-1 text-blue-600">{systemStatus.hosting.storageNote}</p>
                </div>
              )}

              {/* Pipeline */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MiniStat label="Jobs waiting" value={String(systemStatus.pipeline.jobsPending)} />
                <MiniStat label="Jobs running" value={String(systemStatus.pipeline.jobsProcessing)} />
                <MiniStat label="Jobs failed" value={String(systemStatus.pipeline.jobsFailed)} warn={systemStatus.pipeline.jobsFailed > 0} />
                <MiniStat label="Stuck rendering" value={String(systemStatus.pipeline.stuckRendering)} warn={systemStatus.pipeline.stuckRendering > 0} />
              </div>

              {/* Why stuck */}
              {systemStatus.freeTierLimits.whyStuck.length > 0 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                  <p className="text-xs font-bold text-orange-800 mb-2">Why videos may get stuck</p>
                  <ul className="text-xs text-orange-700 space-y-1 list-disc list-inside">
                    {systemStatus.freeTierLimits.whyStuck.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recent errors */}
              {systemStatus.pipeline.recentErrors.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">Recent failures</p>
                  {systemStatus.pipeline.recentErrors.map((err) => (
                    <div key={err.contentId} className="text-xs bg-red-50 border border-red-100 rounded-lg p-2 mb-1">
                      <Link to={`/content/${err.contentId}`} className="font-semibold text-red-700 hover:underline">
                        {err.title.substring(0, 50)}
                      </Link>
                      <p className="text-red-600 mt-0.5">Stage: {err.stage} — {err.error}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={loadSystemStatus}
                className="text-xs text-purple-600 font-semibold hover:underline"
              >
                ↻ Refresh status
              </button>
            </div>
          ) : (
            <p className="text-sm text-red-500">Could not load system status</p>
          )}
        </Section>

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
          <SelectField
            label="YouTube Publish Mode"
            value={config.publishMode || 'immediate'}
            options={['immediate', 'scheduled']}
            onChange={(v) => setConfig({ ...config, publishMode: v })}
          />
          <p className="text-xs text-gray-400">
            <strong>immediate</strong> — video goes public on YouTube right after upload.
            <strong> scheduled</strong> — uploads as private and publishes at the times above.
          </p>
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
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 mb-3">
            <p className="font-bold mb-1">OpenAI quota exceeded?</p>
            <p>Switch LLM to <strong>gemini</strong> (free tier from Google) or <strong>mock</strong> (no API cost). Cursor&apos;s AI cannot be used in deployed apps — it only works inside the Cursor editor.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="LLM" value={config.llmProvider} options={['gemini', 'mock', 'openai']} onChange={(v) => setConfig({ ...config, llmProvider: v })} />
            <SelectField label="Image" value={config.imageProvider} options={['openai', 'mock']} onChange={(v) => setConfig({ ...config, imageProvider: v })} />
            <SelectField label="TTS" value={config.ttsProvider} options={['openai', 'mock']} onChange={(v) => setConfig({ ...config, ttsProvider: v })} />
            <SelectField label="Music" value={config.musicProvider} options={['mock']} onChange={(v) => setConfig({ ...config, musicProvider: v })} />
          </div>
        </Section>

        <Section title="YouTube Integration">
          {youtubeConnected && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-semibold">
              ✅ YouTube connected successfully!
            </div>
          )}
          {youtubeError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <p className="font-bold">Connection failed</p>
              <p className="mt-1 text-xs">{youtubeError}</p>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-700 text-sm">
                {youtubeStatus?.authenticated ? '✅ Connected' : '❌ Not Connected'}
                {youtubeStatus?.channelTitle ? ` — ${youtubeStatus.channelTitle}` : ''}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {youtubeStatus?.message || (
                  youtubeStatus?.configured
                    ? 'YouTube API credentials configured'
                    : 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET on Render'
                )}
              </p>
              {youtubeStatus?.authenticated && youtubeStatus.needsReauth && (
                <p className="text-xs text-orange-600 mt-1 font-semibold">
                  Reconnect required for custom thumbnail permissions
                </p>
              )}
            </div>
            {youtubeStatus?.configured && (
              <button
                onClick={handleYouTubeConnect}
                className="px-4 py-2 bg-red-500 text-white font-bold rounded-xl text-sm hover:bg-red-600 transition-colors"
              >
                {youtubeStatus.authenticated ? 'Reconnect YouTube' : 'Connect YouTube'}
              </button>
            )}
          </div>

          {youtubeStatus?.authenticated && (
            <div className={`p-4 border rounded-xl text-sm ${
              youtubeStatus.thumbnailEligibility === 'eligible' && !youtubeStatus.skipCustomThumbnails
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-orange-50 border-orange-200 text-orange-800'
            }`}>
              <p className="font-bold">
                {youtubeStatus.thumbnailEligibility === 'eligible' && !youtubeStatus.skipCustomThumbnails
                  ? '✅ Custom thumbnails enabled'
                  : youtubeStatus.thumbnailEligibility === 'channel_verification_required'
                    ? '⚠️ Channel verification required for custom thumbnails'
                    : youtubeStatus.thumbnailEligibility === 'scope_missing'
                      ? '⚠️ Reconnect YouTube for thumbnail permissions'
                      : '⚠️ Custom thumbnails currently unavailable'}
              </p>
              <p className="text-xs mt-1">
                {youtubeStatus.customThumbnailsNote}
              </p>

              {youtubeStatus.thumbnailEligibility === 'channel_verification_required' && (
                <div className="mt-3 space-y-2 text-xs">
                  <p>
                    Your video uploads are working. This error is from <strong>YouTube channel eligibility</strong>, not the app.
                    YouTube blocks custom thumbnails until the channel is phone-verified.
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>
                      Open{' '}
                      <a href={youtubeStatus.verifyChannelUrl || 'https://www.youtube.com/verify'} target="_blank" rel="noreferrer" className="underline font-semibold">
                        youtube.com/verify
                      </a>{' '}
                      while signed into the same Google account connected here
                    </li>
                    <li>Complete phone verification for channel <strong>{youtubeStatus.channelTitle || 'your channel'}</strong></li>
                    <li>In YouTube Studio, open any video and confirm you can upload a custom thumbnail manually</li>
                    <li>Click <strong>Retry thumbnails</strong> below after verification</li>
                  </ol>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={youtubeStatus.verifyChannelUrl || 'https://www.youtube.com/verify'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700"
                    >
                      Verify channel
                    </a>
                    <button
                      onClick={handleRetryThumbnails}
                      className="px-3 py-1.5 bg-white border border-orange-300 text-orange-800 font-bold rounded-lg hover:bg-orange-100"
                    >
                      Retry thumbnails
                    </button>
                  </div>
                </div>
              )}

              {youtubeStatus.thumbnailEligibility === 'scope_missing' && (
                <p className="text-xs mt-2">
                  Click <strong>Reconnect YouTube</strong> above and approve all requested permissions.
                </p>
              )}
            </div>
          )}

          {youtubeStatus?.redirectUri && !youtubeStatus.authenticated && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
              <p className="font-bold text-yellow-800 mb-2">Google Cloud Console checklist</p>
              <p className="text-yellow-700 text-xs mb-2">
                Your OAuth client must be type <strong>Web application</strong> (not Desktop).
                Add these <strong>exact</strong> values:
              </p>

              <p className="text-xs font-semibold text-yellow-800 mt-3">Authorized redirect URI:</p>
              <code className="block bg-white p-2 rounded text-xs break-all text-gray-800 border mt-1">
                {youtubeStatus.redirectUri}
              </code>

              <p className="text-xs font-semibold text-yellow-800 mt-3">Authorized JavaScript origin:</p>
              <code className="block bg-white p-2 rounded text-xs break-all text-gray-800 border mt-1">
                {youtubeStatus.redirectUri.replace('/api/youtube/callback', '')}
              </code>

              <ol className="text-xs text-yellow-700 mt-3 space-y-1.5 list-decimal list-inside">
                <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline font-semibold">Google Cloud Credentials</a></li>
                <li>Click your OAuth 2.0 Client ID (Web application)</li>
                <li>Paste the redirect URI and JavaScript origin above → <strong>Save</strong></li>
                <li>Enable <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" className="underline">YouTube Data API v3</a></li>
                <li>Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer" className="underline">OAuth consent screen</a></li>
                <li>If status is <strong>Testing</strong>: add your Gmail under <strong>Test users</strong></li>
                <li>Wait 2 minutes, then click Connect YouTube</li>
                <li>If you see &quot;Google hasn&apos;t verified this app&quot; → click <strong>Advanced</strong> → <strong>Go to KidsTube (unsafe)</strong></li>
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

function StatusCard({ title, status, message, detail, link, linkLabel }: {
  title: string;
  status: string;
  message: string;
  detail?: string;
  link?: string;
  linkLabel?: string;
}) {
  const colors: Record<string, string> = {
    ok: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    not_configured: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    mock: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  const icons: Record<string, string> = { ok: '✅', error: '❌', not_configured: '⚠️', mock: '🔧' };

  return (
    <div className={`p-4 border rounded-xl ${colors[status] || colors.mock}`}>
      <p className="font-bold text-sm">{icons[status] || '•'} {title}</p>
      <p className="text-xs mt-1">{message}</p>
      {detail && <p className="text-xs mt-2 opacity-80">{detail}</p>}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold underline mt-2 inline-block">
          {linkLabel}
        </a>
      )}
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-[10px] font-bold text-gray-400 uppercase">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}
