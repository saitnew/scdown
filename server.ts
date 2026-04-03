import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import NodeID3 from 'node-id3';

const app = express();
const PORT = 3000;

app.use(express.json());

let cachedClientId: string | null = null;

async function getClientId() {
  if (cachedClientId) return cachedClientId;
  try {
    const { data: html } = await axios.get('https://soundcloud.com');
    const scriptUrls = html.match(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+)"/g);
    if (!scriptUrls) throw new Error('Could not find script URLs');

    for (const scriptTag of scriptUrls) {
      const url = scriptTag.match(/src="([^"]+)"/)[1];
      const { data: scriptContent } = await axios.get(url);
      const match = scriptContent.match(/client_id:"([^"]+)"/);
      if (match && match[1]) {
        cachedClientId = match[1];
        return cachedClientId;
      }
    }
    throw new Error('Could not extract client_id');
  } catch (error) {
    console.error('Error getting client_id:', error);
    throw error;
  }
}

app.get('/api/resolve', async (req, res) => {
  try {
    let url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Expand shortlinks (on.soundcloud.com)
    if (url.includes('on.soundcloud.com')) {
      try {
        const expandRes = await axios.get(url, {
          maxRedirects: 0,
          validateStatus: status => status >= 200 && status < 400
        });
        if (expandRes.headers.location) {
          url = expandRes.headers.location;
          // Remove query parameters from the expanded URL for better resolution
          url = url.split('?')[0];
        }
      } catch (e) {
        console.error('Failed to expand shortlink:', e);
      }
    }

    const clientId = await getClientId();
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    
    const { data } = await axios.get(resolveUrl);

    // Hydrate stub tracks in playlists (SoundCloud only returns full data for the first ~5 tracks)
    if (data.kind === 'playlist' && data.tracks && data.tracks.length > 0) {
      const stubIds = data.tracks.filter((t: any) => !t.title).map((t: any) => t.id);
      
      if (stubIds.length > 0) {
        const chunkSize = 50;
        let hydratedTracks: any[] = [];
        
        for (let i = 0; i < stubIds.length; i += chunkSize) {
          const chunk = stubIds.slice(i, i + chunkSize);
          const tracksUrl = `https://api-v2.soundcloud.com/tracks?ids=${chunk.join(',')}&client_id=${clientId}`;
          try {
            const { data: chunkData } = await axios.get(tracksUrl);
            hydratedTracks = hydratedTracks.concat(chunkData);
          } catch (e) {
            console.error('Failed to hydrate tracks chunk', e);
          }
        }
        
        data.tracks = data.tracks.map((t: any) => {
          if (!t.title) {
            const fullTrack = hydratedTracks.find((ht: any) => ht.id === t.id);
            return fullTrack || t;
          }
          return t;
        });
      }
    }

    res.json(data);
  } catch (error: any) {
    console.error('Resolve error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to resolve URL. Make sure it is a valid SoundCloud link.' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const trackId = req.query.id as string;
    if (!trackId) return res.status(400).json({ error: 'Track ID is required' });

    const clientId = await getClientId();
    
    // 1. Get track info for metadata
    const trackInfoUrl = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`;
    const { data: track } = await axios.get(trackInfoUrl);

    // 2. Find the progressive stream URL
    const transcodings = track.media.transcodings;
    const progressive = transcodings.find((t: any) => t.format.protocol === 'progressive');
    
    if (!progressive) {
      return res.status(400).json({ error: 'No progressive stream found for this track' });
    }

    // 3. Get the actual stream URL
    const streamInfoUrl = `${progressive.url}?client_id=${clientId}`;
    const { data: streamInfo } = await axios.get(streamInfoUrl);
    const streamUrl = streamInfo.url;

    // 4. Download the audio file
    const audioResponse = await axios.get(streamUrl, { responseType: 'arraybuffer' });
    let audioBuffer = Buffer.from(audioResponse.data);

    // 5. Download cover art
    let imageBuffer: Buffer | undefined;
    if (track.artwork_url) {
      const highResArtworkUrl = track.artwork_url.replace('-large', '-t500x500');
      try {
        const imageResponse = await axios.get(highResArtworkUrl, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(imageResponse.data);
      } catch (e) {
        console.error('Failed to download artwork', e);
      }
    }

    // 6. Write ID3 tags
    const tags: NodeID3.Tags = {
      title: track.title,
      artist: track.user?.username || 'Unknown Artist',
      album: track.title,
      genre: track.genre,
    };

    if (imageBuffer) {
      tags.image = {
        mime: 'image/jpeg',
        type: { id: 3, name: 'front cover' },
        description: 'Cover',
        imageBuffer: imageBuffer,
      };
    }

    const taggedBuffer = NodeID3.write(tags, audioBuffer);

    // 7. Send file to client
    const filename = `${track.user?.username || 'Unknown Artist'} - ${track.title}.mp3`.replace(/[<>:"/\\|?*]+/g, '');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(taggedBuffer || audioBuffer);

  } catch (error: any) {
    console.error('Download error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to download track' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
