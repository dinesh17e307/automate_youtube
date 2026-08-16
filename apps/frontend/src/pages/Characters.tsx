import { useEffect, useState } from 'react';
import { api, assetUrl, type Character } from '../api';

export default function Characters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCharacters()
      .then(setCharacters)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-white text-center py-20 animate-pulse">Loading characters...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-white">Character Library</h2>
        <p className="text-white/70 mt-1">Consistent characters used across all videos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {characters.map((char) => (
          <div key={char.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="h-40 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
              {char.referenceImageUrl ? (
                <img src={assetUrl(char.referenceImageUrl)} alt={char.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-6xl">
                  {char.name === 'Bunny' ? '🐰' : char.name === 'Ellie' ? '🐘' : '☀️'}
                </span>
              )}
            </div>
            <div className="p-5">
              <h3 className="text-lg font-extrabold text-gray-800">{char.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{char.description}</p>

              <div className="mt-4 space-y-2">
                <Detail label="Appearance" value={char.appearance} />
                <Detail label="Clothing" value={char.clothing} />
                <Detail label="Colors" value={char.colors} />
                <Detail label="Personality" value={char.personality} />
                <Detail label="Voice" value={char.voiceDescription} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase">{label}</p>
      <p className="text-xs text-gray-600">{value}</p>
    </div>
  );
}
