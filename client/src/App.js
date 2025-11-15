import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://YOUR_RENDER_URL';

function App() {
  const [q, setQ] = useState('Chhattisgarhi song');
  const [items, setItems] = useState([]);
  const [pageToken, setPageToken] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchSearch(); }, []);

  async function fetchSearch(pt='') {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/search`, { params: { q, pageToken: pt }});
      const data = res.data;
      setItems(data.items || []);
      setPageToken(data.nextPageToken || '');
    } catch (e) {
      console.error(e);
      alert('Search failed. Check console.');
    } finally { setLoading(false); }
  }

  async function openVideo(videoId) {
    try {
      const res = await axios.get(`${API_BASE}/api/videos`, { params: { ids: videoId }});
      const item = res.data.items && res.data.items[0];
      if (item && item.status && item.status.embeddable) {
        setSelected(videoId);
        setSelectedMeta(item);
      } else {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to get video details.');
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Chhattisgarh Songs</h1>
        <div className="searchRow">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search songs, artist..." />
          <button onClick={() => fetchSearch()}>Search</button>
        </div>
      </header>

      {loading ? <p>Loading...</p> : (
        <div className="grid">
          {items.map(it => {
            const vid = it.id && (it.id.videoId || it.id);
            const thumb = it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url;
            return (
              <div className="card" key={vid}>
                <img src={thumb} alt={it.snippet?.title} onClick={() => openVideo(vid)} />
                <div className="meta">
                  <div className="title" title={it.snippet?.title}>{it.snippet?.title}</div>
                  <div className="channel">{it.snippet?.channelTitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageToken && <div className="pager"><button onClick={()=>fetchSearch(pageToken)}>Next Page</button></div>}

      {selected && (
        <div className="modal">
          <div className="modalInner">
            <button className="closeBtn" onClick={()=>setSelected(null)}>Close</button>
            <iframe
              width="900"
              height="506"
              src={`https://www.youtube.com/embed/${selected}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={selectedMeta?.snippet?.title || 'player'}
            />
            <h3>{selectedMeta?.snippet?.title}</h3>
            <a href={`https://www.youtube.com/watch?v=${selected}`} target="_blank" rel="noreferrer">Open on YouTube</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
