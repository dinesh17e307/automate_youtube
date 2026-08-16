const STAGE_ORDER = [
  'idea', 'script', 'scenes', 'characters', 'voice',
  'music', 'rendering', 'thumbnail', 'validation', 'uploaded', 'published',
];

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea',
  script: 'Script',
  scenes: 'Scenes',
  characters: 'Characters',
  voice: 'Voice',
  music: 'Music',
  rendering: 'Rendering',
  thumbnail: 'Thumbnail',
  validation: 'Validation',
  uploaded: 'Uploaded',
  published: 'Published',
};

export function PipelineProgress({ currentStage, status }: { currentStage: string; status?: string }) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const isPipelineComplete = status === 'published' || status === 'scheduled' || status === 'awaiting_approval';

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {STAGE_ORDER.map((stage, i) => {
        const isComplete = isPipelineComplete ? i <= currentIndex : i < currentIndex;
        const isCurrent = !isPipelineComplete && stage === currentStage;
        const isWaitingPublish = status === 'scheduled' && stage === 'published';
        const isPending = !isComplete && !isCurrent && !isWaitingPublish;

        return (
          <div key={stage} className="flex items-center">
            <div className="flex flex-col items-center min-w-[60px]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isComplete
                    ? 'bg-green-500 text-white'
                    : isWaitingPublish
                    ? 'bg-purple-500 text-white ring-4 ring-purple-200'
                    : isCurrent
                    ? 'bg-blue-500 text-white ring-4 ring-blue-200 animate-pulse'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isComplete ? '✓' : isWaitingPublish ? '⏳' : i + 1}
              </div>
              <span
                className={`text-[10px] mt-1 font-semibold ${
                  isWaitingPublish
                    ? 'text-purple-600'
                    : isCurrent
                    ? 'text-blue-600'
                    : isPending
                    ? 'text-gray-400'
                    : 'text-green-600'
                }`}
              >
                {isWaitingPublish ? 'Scheduled' : STAGE_LABELS[stage]}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div
                className={`w-4 h-0.5 mb-4 ${
                  isComplete ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-600',
    generating: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    scheduled: 'bg-purple-100 text-purple-700',
    published: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    awaiting_approval: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${colors[status] || colors.pending}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function StatCard({ label, value, icon, color = 'blue' }: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-2xl shadow-md`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-500 text-sm font-semibold">{label}</p>
        <p className="text-2xl font-extrabold text-gray-800">{value}</p>
      </div>
    </div>
  );
}
