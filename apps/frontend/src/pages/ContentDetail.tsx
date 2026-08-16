import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, assetUrl, type ContentDetail } from '../api';
import { PipelineProgress, StatusBadge } from '../components/ui';

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState<ContentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const data = await api.getContentById(id);
      setContent(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.approveContent(id);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerate = async (stage: string) => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.regenerateStage(id, stage);
      setTimeout(load, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="text-white text-center py-20 animate-pulse">Loading...</div>;
  }

  if (!content) {
    return <div className="text-white text-center py-20">Content not found</div>;
  }

  const script = content.script as Record<string, string> | undefined;
  const scenes = content.scenes as Record<string, unknown>[] | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/content" className="text-white/70 hover:text-white text-sm font-semibold">
          ← Back to Content
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{content.type === 'short' ? '📱' : '🎬'}</span>
              <h2 className="text-2xl font-extrabold text-gray-800">{content.title}</h2>
            </div>
            <p className="text-gray-500 text-sm">
              {content.category.replace(/_/g, ' ')} · Created {new Date(content.createdAt).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={content.status} />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Pipeline Progress</h3>
          <PipelineProgress currentStage={content.currentStage} />
        </div>

        <div className="mt-6 flex gap-3 flex-wrap">
          {content.status === 'awaiting_approval' && (
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="px-5 py-2.5 bg-green-500 text-white font-bold rounded-xl hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              ✓ Approve & Upload
            </button>
          )}
          {['script', 'scenes', 'voice', 'thumbnail'].map((stage) => (
            <button
              key={stage}
              onClick={() => handleRegenerate(stage)}
              disabled={actionLoading}
              className="px-4 py-2 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
            >
              ↻ Regenerate {stage}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {content.thumbnailUrl && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-bold text-gray-800 mb-3">Thumbnail</h3>
            <img src={assetUrl(content.thumbnailUrl)} alt="Thumbnail" className="rounded-xl w-full" />
          </div>
        )}

        {content.videoUrl && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="font-bold text-gray-800 mb-3">Video Preview</h3>
            <video src={assetUrl(content.videoUrl)} controls className="rounded-xl w-full" />
          </div>
        )}
      </div>

      {script && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-bold text-gray-800 mb-3">Script</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Description</p>
              <p className="text-sm text-gray-700 mt-1">{script.description}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Lyrics / Dialogue</p>
              <pre className="text-sm text-gray-700 mt-1 whitespace-pre-wrap font-sans bg-gray-50 p-4 rounded-xl">
                {script.lyrics}
              </pre>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Tags</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {(script.tags as unknown as string[])?.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {scenes && scenes.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-bold text-gray-800 mb-3">Scenes ({scenes.length})</h3>
          <div className="space-y-4">
            {scenes.map((scene, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-gray-700 text-sm">
                    Scene {(scene.sceneNumber as number) || i + 1}: {scene.title as string}
                  </h4>
                  <span className="text-xs text-gray-400">{scene.durationSeconds as number}s</span>
                </div>
                <p className="text-sm text-gray-600 italic">"{scene.dialogue as string}"</p>
                <p className="text-xs text-gray-400 mt-1">Background: {scene.background as string}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.jobLogs && content.jobLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-bold text-gray-800 mb-3">Job Log</h3>
          <div className="space-y-2">
            {content.jobLogs.map((log, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${log.status === 'completed' ? 'bg-green-400' : log.status === 'failed' ? 'bg-red-400' : 'bg-blue-400'}`} />
                <span className="font-semibold text-gray-600 capitalize">{log.jobType}</span>
                <span className="text-gray-400">{log.message}</span>
                <span className="text-gray-300 ml-auto text-xs">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
