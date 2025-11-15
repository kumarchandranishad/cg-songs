// client/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://cg-songs.onrender.com';

// Replace these with the actual channel IDs you want (or leave blank)
const AVAILABLE_CHANNELS = [
  // Example: 'UC6wE1QldDPmYWwGyuudy3Tg',
  // 'UCxxxxxxxxxxxxxxxxx2'
];

export default function App() {
  const [q, setQ] = useState('Chhattisgarhi song');
  const [items, setItems] = useState([]);
  const [pageToken, setPageToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [allowedChannels, setAllowedChannels] = useState(AVAILABLE_CHANNELS);
  const [suggestions, setSuggestions] = useState([]);
  const searchTimeout = useRef(null);

  useEffect(() => {
    fetchSearch();
    // eslint-disable-next-line
  }, []);

  async function fetchSearch(pt = '') {
    try {
      setLoading(true);
      const channelsParam = allowedChannels.join(',');
      const res = await axios.get(`${API_BASE}/api/search`, {
        params: { q, pageToken: pt, maxResults: 12, channels: channelsParam }
      });
      const data = res.data;
      // data.items is filtered videos (full video resources)
      setItems(data.items || []);
      setPageToken((data.originalSearch && data.originalSearch.nextPageToken) || '');
    } catch (e) {
      console.error(e);
      alert('Search failed — check console.');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(v) {
    setQ(v);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchSearch(), 450);
  }

  function toggleChannel(chId) {
    setAllowedChannels(prev => {
      if (prev.includes(chId)) return prev.filter(x => x !== chId);
      return [...prev, chId];
    });
  }

  useEffect(() => {
    // re-fetch when allowedChannels changes
    fetchSearch();
    // eslint-disable-next-line
  }, [allowedChannels]);

  async function openVideo(videoId) {
    try {
      // we already have video details from search result (items contain full video resource)
      setSelectedVideo(items.find(it => it.id === videoId) || null);
    } catch (e) {
      console.error(e);
      alert('Failed to open video');
    }
  }

  return (
    <div className="container">
      <header className="topbar">
        <h1>Chhattisgarh Songs</h1>
        <div className="searchRow">
          <input value={q} onChange={e => handleSearchChange(e.target.value)} placeholder="Search songs, artist..." />
          <button onClick={() => fetchSearch()}>Search</button>
        </div>
      </header>

      <div className="controls">
        <div className="channels">
          <strong>Channels:</strong>
          {AVAILABLE_CHANNELS.length === 0 ? (
            <span className="hint"> (No channel preselected. Add channel IDs in code or use UI to paste.)</span>
          ) : AVAILABLE_CHANNELS.map(ch => (
            <label key={ch} className={`chip ${allowedChannels.includes(ch) ? 'active' : ''}`}>
              <input type="checkbox" checked={allowedChannels.includes(ch)} onChange={() => toggleChannel(ch)} />
              {ch}
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="card placeholder" key={i}>
              <div className="thumb placeholderBox" />
              <div className="meta">
                <div className="title placeholderBox short" />
                <div className="channel placeholderBox tiny" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid">
          {items.map(it => {
            const v = it;
            const vid = v.id;
            const snippet = v.snippet || {};
            const thumb = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
            return (
              <div className="card" key={vid}>
                <img loading="lazy" src={thumb} alt={snippet.title} onClick={() => openVideo(vid)} />
                <div className="meta">
                  <div className="title" title={snippet.title}>{snippet.title}</div>
                  <div className="channel">{snippet.channelTitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageToken && <div className="pager"><button onClick={() => fetchSearch(pageToken)}>Next Page</button></div>}

      {selectedVideo && (
        <div className="modal">
          <div className="modalInner">
            <button className="closeBtn" onClick={() => setSelectedVideo(null)}>Close</button>
            <iframe
              width="900"
              height="506"
              src={`https://www.youtube.com/embed/${selectedVideo.id}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={selectedVideo.snippet?.title || 'player'}
            />
            <h3>{selectedVideo.snippet?.title}</h3>
            <p>{selectedVideo.snippet?.description?.slice(0, 300)}</p>
            <a href={`https://www.youtube.com/watch?v=${selectedVideo.id}`} target="_blank" rel="noreferrer">Open on YouTube</a>
          </div>
        </div>
      )}
    </div>
  );
}
