import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ContentItem } from '../api';
import { StatusBadge } from '../components/ui';

export default function Content() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const params: { limit: number; type?: string; status?: string } = { limit: 50 };
      if (filter === 'long' || filter === 'short') params.type = filter;
      if (filter !== 'all' && filter !== 'long' && filter !== 'short') params.status = filter;
      const result = await api.getContent(params);
      setContents(result.contents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleGenerate = async (type: 'long' | 'short') => {
    setGenerating(true);
    try {
      await api.generateContent(type);
      setTimeout(load, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'long', label: 'Videos' },
    { key: 'short', label: 'Shorts' },
    { key: 'generating', label: 'Generating' },
    { key: 'awaiting_approval', label: 'Awaiting Approval' },
    { key: 'published', label: 'Published' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-white">Content Library</h2>
          <p className="text-white/70 mt-1">All generated videos and shorts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleGenerate('long')}
            disabled={generating}
            className="px-4 py-2 bg-white text-purple-700 font-bold rounded-xl shadow hover:shadow-lg transition-all disabled:opacity-50 text-sm"
          >
            + Long Video
          </button>
          <button
            onClick={() => handleGenerate('short')}
            disabled={generating}
            className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl shadow hover:shadow-lg transition-all disabled:opacity-50 text-sm"
          >
            + Short
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === f.key
                ? 'bg-white text-purple-700 shadow-lg'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : contents.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No content found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Title</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Type</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Category</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Stage</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Views</th>
                <th className="text-left p-4 text-xs font-bold text-gray-400 uppercase">Created</th>
              </tr>
            </thead>
            <tbody>
              {contents.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <Link to={`/content/${item.id}`} className="font-semibold text-gray-800 hover:text-blue-600 text-sm">
                      {item.title}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-gray-500">{item.type === 'short' ? '📱 Short' : '🎬 Video'}</td>
                  <td className="p-4 text-sm text-gray-500">{item.category.replace(/_/g, ' ')}</td>
                  <td className="p-4 text-sm text-gray-500 capitalize">{item.currentStage}</td>
                  <td className="p-4"><StatusBadge status={item.status} /></td>
                  <td className="p-4 text-sm text-gray-500">{item.analytics?.views || '—'}</td>
                  <td className="p-4 text-sm text-gray-400">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
