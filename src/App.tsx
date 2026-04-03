import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Download, Music, Loader2, AlertCircle, CheckCircle2, Trash2, X } from 'lucide-react';
import axios from 'axios';

interface Track {
  id: number;
  title: string;
  user?: { username?: string };
  artwork_url: string;
  duration: number;
}

interface Playlist {
  id: number;
  title: string;
  user?: { username?: string };
  artwork_url: string;
  tracks: Track[];
}

type ResultType = 'track' | 'playlist' | null;

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultType, setResultType] = useState<ResultType>(null);
  const [trackData, setTrackData] = useState<Track | null>(null);
  const [playlistData, setPlaylistData] = useState<Playlist | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setResultType(null);
    setTrackData(null);
    setPlaylistData(null);
    setDownloadedIds(new Set());

    try {
      const { data } = await axios.get(`/api/resolve?url=${encodeURIComponent(url)}`);
      
      if (data.kind === 'track') {
        setResultType('track');
        setTrackData(data);
      } else if (data.kind === 'playlist') {
        setResultType('playlist');
        setPlaylistData(data);
      } else {
        setError('Неподдерживаемый тип ссылки. Пожалуйста, введите ссылку на трек или плейлист.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось найти трек. Убедитесь, что ссылка правильная.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (track: Track) => {
    if (downloadingIds.has(track.id)) return;
    
    setDownloadingIds(prev => new Set(prev).add(track.id));
    try {
      const response = await axios.get(`/api/download?id=${track.id}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `${track.user?.username || 'Unknown Artist'} - ${track.title}.mp3`.replace(/[<>:"/\\|?*]+/g, '');
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setDownloadedIds(prev => new Set(prev).add(track.id));
    } catch (err) {
      alert('Не удалось скачать трек.');
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const downloadPlaylist = async () => {
    if (!playlistData) return;
    const concurrency = 3; // Скачиваем по 3 трека одновременно для скорости и стабильности
    const tracksToDownload = playlistData.tracks.filter(t => !downloadedIds.has(t.id) && !downloadingIds.has(t.id));
    
    for (let i = 0; i < tracksToDownload.length; i += concurrency) {
      const chunk = tracksToDownload.slice(i, i + concurrency);
      await Promise.all(chunk.map(t => handleDownload(t)));
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
  };

  const getHighResArtwork = (url: string | null) => {
    if (!url) return 'https://picsum.photos/seed/sc/500/500';
    return url.replace('-large', '-t500x500');
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden relative font-sans selection:bg-white/30 no-scrollbar">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -left-[20%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-zinc-800/40 to-transparent blur-3xl"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.5, 1],
            opacity: [0.2, 0.4, 0.2],
            rotate: [0, -90, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -right-[20%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-tl from-zinc-700/30 to-transparent blur-3xl"
        />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-6 py-12 min-h-screen flex flex-col">
        
        {/* Header */}
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-white/5 mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            <Music className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-2">
            SC<span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-500">DOWN</span>
          </h1>
          <p className="text-amber-400 text-xs font-black tracking-[0.3em] uppercase drop-shadow-[0_0_15px_rgba(251,191,36,0.4)]">
            PREMIUM
          </p>
        </motion.div>

        {/* Search Input */}
        <motion.form 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          onSubmit={handleSearch}
          className="relative mb-8 group"
        >
          <div className="absolute -inset-1 bg-white/20 rounded-2xl blur-md opacity-50 group-focus-within:opacity-100 transition duration-500"></div>
          <div className="relative flex items-center bg-zinc-900/80 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.1)] group-focus-within:shadow-[0_0_25px_rgba(255,255,255,0.3)] transition-all duration-300">
            <div className="pl-4 pr-2">
              <Search className="w-5 h-5 text-zinc-400 group-focus-within:text-white transition-colors" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Вставьте ссылку SoundCloud..."
              className="w-full py-4 bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base"
              required
            />
            <AnimatePresence>
              {url && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={() => setUrl('')}
                  className="p-2 mr-1 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
            <button 
              type="submit"
              disabled={loading}
              className="px-6 py-4 bg-white text-black font-bold text-sm uppercase tracking-wider hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Найти'}
            </button>
          </div>
        </motion.form>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence mode="wait">
          {resultType === 'track' && trackData && (
            <motion.div
              key="track"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex-1 flex flex-col"
            >
              <div className="relative aspect-square w-full max-w-[280px] mx-auto mb-8 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] group">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
                <img 
                  src={getHighResArtwork(trackData.artwork_url)} 
                  alt={trackData.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2 line-clamp-2 leading-tight">{trackData.title}</h2>
                <p className="text-zinc-400 font-medium">{trackData.user?.username || 'Неизвестный исполнитель'}</p>
                <p className="text-zinc-600 text-sm mt-2">{formatDuration(trackData.duration)}</p>
              </div>

              <div className="mt-auto pb-8">
                <motion.button
                  whileHover={{ scale: downloadedIds.has(trackData.id) ? 1 : 1.02 }}
                  whileTap={{ scale: downloadedIds.has(trackData.id) ? 1 : 0.98 }}
                  onClick={() => handleDownload(trackData)}
                  disabled={downloadingIds.has(trackData.id) || downloadedIds.has(trackData.id)}
                  className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                    downloadedIds.has(trackData.id)
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                      : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] disabled:opacity-70'
                  }`}
                >
                  {downloadingIds.has(trackData.id) ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Скачивание...
                    </>
                  ) : downloadedIds.has(trackData.id) ? (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      Скачано
                    </>
                  ) : (
                    <>
                      <Download className="w-6 h-6" />
                      Скачать Трек
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}

          {resultType === 'playlist' && playlistData && (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col pb-8"
            >
              <div className="relative aspect-square w-full max-w-[240px] mx-auto mb-6 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] group">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
                <img 
                  src={getHighResArtwork(playlistData.artwork_url || playlistData.tracks[0]?.artwork_url)} 
                  alt={playlistData.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2 line-clamp-2 leading-tight">{playlistData.title}</h2>
                <p className="text-zinc-400 font-medium">{playlistData.user?.username || 'Неизвестный исполнитель'}</p>
                <p className="text-zinc-500 text-sm mt-2">{playlistData.tracks.length} треков</p>
              </div>

              {(() => {
                const totalTracks = playlistData.tracks.length;
                const downloadedCount = playlistData.tracks.filter(t => downloadedIds.has(t.id)).length;
                const isDownloadingPlaylist = playlistData.tracks.some(t => downloadingIds.has(t.id));
                const isAllDownloaded = downloadedCount === totalTracks && totalTracks > 0;

                if (isAllDownloaded) {
                  return (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full py-4 mb-6 rounded-2xl bg-green-500/10 text-green-400 font-bold text-sm flex items-center justify-center gap-2 border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Все треки скачаны
                    </motion.div>
                  );
                }

                if (isDownloadingPlaylist) {
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full mb-6 relative overflow-hidden rounded-2xl bg-zinc-900/80 border border-white/10 p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
                    >
                      <div className="flex justify-between text-sm font-bold mb-3 text-zinc-300">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          Скачивание...
                        </span>
                        <span className="text-white">{downloadedCount} / {totalTracks}</span>
                      </div>
                      <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${(downloadedCount / totalTracks) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={downloadPlaylist}
                    className="w-full py-4 mb-6 rounded-2xl bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-white hover:text-black transition-all border border-white/5 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  >
                    <Download className="w-5 h-5" />
                    Скачать все треки
                  </motion.button>
                );
              })()}

              <div className="space-y-3 mb-8">
                {playlistData.tracks.map((track, index) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={track.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/30 hover:bg-zinc-800/50 border border-transparent hover:border-white/10 transition-colors"
                  >
                    <img 
                      src={getHighResArtwork(track.artwork_url)} 
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{track.title}</p>
                      <p className="text-xs text-zinc-400 truncate">{track.user?.username || 'Неизвестный исполнитель'}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(track)}
                      disabled={downloadingIds.has(track.id) || downloadedIds.has(track.id)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                        downloadedIds.has(track.id)
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-white/10 text-white hover:bg-white hover:text-black disabled:opacity-50 disabled:hover:bg-white/10 disabled:hover:text-white'
                      }`}
                    >
                      {downloadingIds.has(track.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : downloadedIds.has(track.id) ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

