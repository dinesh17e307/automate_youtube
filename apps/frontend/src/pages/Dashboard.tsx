import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DashboardStatus } from '../api';
import { PipelineProgress, StatusBadge, StatCard } from '../components/ui';

export default function Dashboard() {
  const [data, setData] = useState<DashboardStatus | null>(null);
  const [calendar, setCalendar] = useState<Awaited<ReturnType<typeof api.getCalendar>>>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const load = async () => {
    try {
      const [status, cal] = await Promise.all([api.getDashboard(), api.getCalendar(7)]);
      setData(status);
      setCalendar(cal);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await api.triggerPipeline();
      setTimeout(load, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-white text-lg font-semibold animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-white">Dashboard</h2>
          <p className="text-white/70 mt-1">Monitor your automated content pipeline</p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="px-6 py-3 bg-white text-purple-700 font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        >
          {triggering ? 'Triggering...' : '▶ Run Daily Pipeline'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Videos" value={stats?.totalVideos || 0} icon="🎬" color="blue" />
        <StatCard label="Total Shorts" value={stats?.totalShorts || 0} icon="📱" color="purple" />
        <StatCard label="Total Views" value={(stats?.totalViews || 0).toLocaleString()} icon="👀" color="green" />
        <StatCard label="Pending Approval" value={stats?.pendingApproval || 0} icon="⏳" color="orange" />
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Today's Content</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TodayCard label="Long Video" content={data?.today.longVideo} icon="🎬" />
          <TodayCard label="Short" content={data?.today.short} icon="📱" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Content Calendar</h3>
        <div className="grid grid-cols-7 gap-2">
          {calendar.map((day) => (
            <div key={day.date} className="text-center">
              <p className="text-xs font-bold text-gray-400 mb-1">{day.dayOfWeek}</p>
              <div className="bg-gray-50 rounded-xl p-3 min-h-[80px]">
                {day.longVideo ? (
                  <p className="text-xs font-semibold text-gray-700 truncate" title={day.longVideo.title}>
                    🎬 {day.longVideo.title.split('|')[0].trim().substring(0, 20)}
                  </p>
                ) : (
                  <p className="text-xs text-gray-300">—</p>
                )}
                {day.short && (
                  <p className="text-xs font-semibold text-purple-600 truncate mt-1" title={day.short.title}>
                    📱 {day.short.title.substring(0, 18)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Recent Content</h3>
          <Link to="/content" className="text-sm text-blue-600 font-semibold hover:underline">
            View all →
          </Link>
        </div>
        <div className="space-y-3">
          {data?.recentContent.map((item) => (
            <Link
              key={item.id}
              to={`/content/${item.id}`}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.type === 'short' ? '📱' : '🎬'}</span>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                  <p className="text-xs text-gray-400">{item.category.replace(/_/g, ' ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {item.analytics && (
                  <span className="text-xs text-gray-500">{item.analytics.views} views</span>
                )}
                <StatusBadge status={item.status} />
              </div>
            </Link>
          ))}
          {(!data?.recentContent || data.recentContent.length === 0) && (
            <p className="text-center text-gray-400 py-8">No content yet. Trigger the pipeline to get started!</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TodayCard({ label, content, icon }: {
  label: string;
  content?: { id: string; title: string; status: string; currentStage: string } | null;
  icon: string;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <h4 className="font-bold text-gray-700">{label}</h4>
        {content && <StatusBadge status={content.status} />}
      </div>
      {content ? (
        <div>
          <Link to={`/content/${content.id}`} className="font-semibold text-gray-800 hover:text-blue-600 text-sm">
            {content.title}
          </Link>
          <div className="mt-3">
            <PipelineProgress currentStage={content.currentStage} />
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Not generated yet</p>
      )}
    </div>
  );
}
