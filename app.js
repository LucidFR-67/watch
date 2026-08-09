import { WatchPlayer } from './player.js';

const API_URL = 'http://localhost:8000/api';
// Production ready fallback: const API_URL = window.location.hostname.includes('localhost') ? 'http://localhost:8000/api' : 'https://watch-backend.lucidfr.site/api';

const state = {
    videos: [],
    searchResults: [],
    searchQuery: '',
    favorites: JSON.parse(localStorage.getItem('watch_favorites')) || [],
    currentRoute: '/',
    heroIndex: 0,
    heroTimer: null
};

// DOM Elements
const elements = {
    app: document.getElementById('app'),
    navLinks: document.querySelectorAll('.nav-link'),
    menuOverlay: document.getElementById('menuOverlay'),
    menuBtn: document.getElementById('menuBtn'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    closeMenuBtn: document.getElementById('closeMenuBtn'),
    toast: document.getElementById('toast'),
    refreshBtns: [document.getElementById('refreshBtn'), document.getElementById('menuRefreshBtn')]
};

// Format Utilities
const formatDuration = (seconds) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}H ${m}M`;
    return `${m}M`;
};

const formatRes = (w, h) => {
    if (!w || !h) return '';
    if (w >= 3800) return '4K';
    if (w >= 1900) return '1080P';
    if (w >= 1200) return '720P';
    return 'SD';
};

const getThumbnail = (id) => `${API_URL}/videos/${id}/thumbnail`;

// API Calls
async function fetchVideos(search = '') {
    try {
        const res = await fetch(`${API_URL}/videos?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch');
        return await res.json();
    } catch (err) {
        console.error(err);
        return { items: [] };
    }
}

async function fetchVideoDetails(id) {
    try {
        const res = await fetch(`${API_URL}/videos/${id}`);
        if (!res.ok) throw new Error('Failed to fetch video');
        return await res.json();
    } catch (err) {
        console.error(err);
        return null;
    }
}

async function triggerRefresh() {
    try {
        showToast('REFRESHING ARCHIVE<br><small>Scanning media...</small>');
        const res = await fetch(`${API_URL}/refresh`, { method: 'POST' });
        const data = await res.json();
        
        const checkStatus = async () => {
            const statusRes = await fetch(`${API_URL}/refresh/status`);
            const statusData = await statusRes.json();
            if (statusData.status === 'running') {
                setTimeout(checkStatus, 2000);
            } else {
                showToast(`ARCHIVE UPDATED<br><small>Found ${statusData.last_scan?.new || 0} new files.</small>`);
                init(); // Reload
            }
        };
        checkStatus();
    } catch (err) {
        showToast('ERROR<br><small>Could not reach archive.</small>');
    }
}

// Router
function parseRoute() {
    let hash = window.location.hash || '#/';
    let route = hash.slice(1).split('?')[0];
    let params = new URLSearchParams(hash.split('?')[1] || '');
    return { route, params };
}

async function navigate() {
    const { route, params } = parseRoute();
    state.currentRoute = route;
    
    // Update active nav links
    elements.navLinks.forEach(link => {
        if (link.dataset.route === route) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    elements.app.classList.add('navigating');
    
    // Wait for fade out
    await new Promise(r => setTimeout(r, 400));
    
    if (state.heroTimer) {
        clearInterval(state.heroTimer);
    }
    
    // Cleanup old player
    if (window.playerInstance) {
        window.playerInstance.destroy();
    }
    
    window.scrollTo(0, 0);

    if (route === '/') {
        await renderHome();
    } else if (route === '/library') {
        await renderLibrary();
    } else if (route === '/search') {
        await renderSearch(params.get('q') || '');
    } else if (route.startsWith('/video/')) {
        const id = route.split('/')[2];
        await renderVideoDetail(id);
    } else if (route === '/stream') {
        const url = params.get('url');
        await renderStream(url);
    } else if (route.startsWith('/watch/')) {
        const id = route.split('/')[2];
        await renderWatch(id);
    } else {
        await renderHome();
    }

    elements.app.classList.remove('navigating');
}

// Views
async function renderHome() {
    if (state.videos.length === 0) {
        const data = await fetchVideos();
        state.videos = data.items || [];
    }

    if (state.videos.length === 0) {
        elements.app.innerHTML = `
            <div class="empty-state">
                <h2 class="serif">Archive empty</h2>
                <p>No cinematic media discovered.</p>
            </div>
        `;
        return;
    }

    const heroVideos = state.videos.slice(0, 5); // Cycle top 5
    
    elements.app.innerHTML = `
        <div class="hero">
            <div class="hero-images" id="heroImages">
                ${heroVideos.map((v, i) => `
                    <img src="${v.backdrop || v.thumbnail || getThumbnail(v.id)}" class="hero-img ${i === 0 ? 'active' : ''}" data-index="${i}" alt="${v.title}">
                `).join('')}
            </div>
            <div class="hero-content" id="heroContent">
                <div class="hero-title-container">
                    ${heroVideos.map((v, i) => `
                        <div class="hero-title serif ${i === 0 ? 'active' : ''}" data-index="${i}">${v.title}</div>
                    `).join('')}
                </div>
                <div class="hero-meta-container">
                    ${heroVideos.map((v, i) => {
                        const meta = [v.year, ...(v.genres || [])].filter(Boolean).join(' · ');
                        return `<div class="hero-meta ${i === 0 ? 'active' : ''}" data-index="${i}">${meta}</div>`;
                    }).join('')}
                </div>
                <a href="#/watch/${heroVideos[0].id}" class="watch-btn" id="heroWatchBtn">Watch &rarr;</a>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">Recently added</div>
            <div class="video-grid">
                ${state.videos.slice(0, 6).map(v => createVideoCard(v)).join('')}
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">From the archive</div>
            <div class="video-grid">
                ${state.videos.slice(6, 12).map(v => createVideoCard(v)).join('')}
            </div>
        </div>
    `;

    // Setup hero crossfade
    if (heroVideos.length > 1) {
        state.heroIndex = 0;
        state.heroTimer = setInterval(() => {
            const nextIndex = (state.heroIndex + 1) % heroVideos.length;
            
            // Images
            document.querySelectorAll('.hero-img').forEach(img => img.classList.remove('active'));
            document.querySelector(`.hero-img[data-index="${nextIndex}"]`).classList.add('active');
            
            // Titles
            document.querySelectorAll('.hero-title').forEach(title => title.classList.remove('active'));
            document.querySelector(`.hero-title[data-index="${nextIndex}"]`).classList.add('active');
            
            // Meta
            document.querySelectorAll('.hero-meta').forEach(meta => meta.classList.remove('active'));
            const nextMeta = document.querySelector(`.hero-meta[data-index="${nextIndex}"]`);
            if (nextMeta) nextMeta.classList.add('active');
            
            // Update button link
            document.getElementById('heroWatchBtn').href = `#/watch/${heroVideos[nextIndex].id}`;
            
            state.heroIndex = nextIndex;
        }, 6000);
    }
}

async function renderLibrary() {
    if (state.videos.length === 0) {
        const data = await fetchVideos();
        state.videos = data.items || [];
    }
    
    elements.app.innerHTML = `
        <div class="section" style="padding-top: 10rem;">
            <div class="section-header" style="font-size: 3rem;">The Library</div>
            <div class="video-grid">
                ${state.videos.map(v => createVideoCard(v)).join('')}
            </div>
        </div>
    `;
}

async function renderSearch(initialQuery) {
    elements.app.innerHTML = `
        <div class="search-container" style="margin-bottom: 2rem;">
            <input type="text" id="searchInput" class="search-input" placeholder="Search the library..." value="${initialQuery || ''}" autocomplete="off">
        </div>
        
        <div class="section" style="margin-bottom: 4rem; max-width: 800px; margin-left: auto; margin-right: auto; text-align: center;">
            <h3 style="margin-bottom: 1rem; color: var(--text-muted); font-size: 0.9rem; letter-spacing: 0.1em; text-transform: uppercase;">Or stream directly from URL</h3>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <input type="text" id="urlInput" class="search-input" style="font-size: 1.2rem; padding: 0.75rem 0;" placeholder="https://..." autocomplete="off">
                <button id="streamBtn" style="background: var(--text); color: var(--bg); padding: 0.75rem 2rem; border: none; cursor: pointer; white-space: nowrap; font-size: 0.9rem; letter-spacing: 0.1em; text-transform: uppercase; transition: opacity 0.2s;">Play URL</button>
            </div>
        </div>

        <div class="search-meta" id="searchMeta"></div>
        <div class="video-grid" id="searchResults"></div>
    `;

    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');
    const metaContainer = document.getElementById('searchMeta');
    
    document.getElementById('streamBtn').addEventListener('click', () => {
        const url = document.getElementById('urlInput').value.trim();
        if (url) {
            window.location.hash = `/stream?url=${encodeURIComponent(url)}`;
        }
    });

    let debounceTimeout;

    const performSearch = async (query) => {
        if (!query.trim()) {
            resultsContainer.innerHTML = '';
            metaContainer.textContent = '';
            return;
        }

        metaContainer.textContent = 'SEARCHING...';
        resultsContainer.innerHTML = '';
        
        const data = await fetchVideos(query);
        
        if (data.items.length === 0) {
            metaContainer.textContent = 'NOTHING MATCHED';
            resultsContainer.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <p>Try another title, filename or phrase.</p>
                </div>
            `;
        } else {
            metaContainer.textContent = `${data.total} RESULT${data.total !== 1 ? 'S' : ''} FOUND`;
            resultsContainer.innerHTML = data.items.map(v => createVideoCard(v)).join('');
        }
    };

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        const query = e.target.value;
        
        // Update URL without triggering nav
        const newUrl = `${window.location.pathname}#/search${query ? `?q=${encodeURIComponent(query)}` : ''}`;
        window.history.replaceState(null, '', newUrl);

        debounceTimeout = setTimeout(() => {
            performSearch(query);
        }, 500);
    });

    if (initialQuery) {
        performSearch(initialQuery);
    } else {
        metaContainer.textContent = '';
    }
    
    // Focus on desktop
    if (window.innerWidth > 768) {
        setTimeout(() => input.focus(), 500);
    }
}

async function renderVideoDetail(id) {
    const video = await fetchVideoDetails(id);
    
    if (!video) {
        elements.app.innerHTML = `<div class="empty-state"><h2 class="serif">Not found</h2><p>This media could not be located.</p></div>`;
        return;
    }

    const isFav = state.favorites.includes(video.id);

    let audioHtml = video.audio_tracks.length ? video.audio_tracks.map(a => `
        <div class="detail-item">
            <span class="detail-item-label">${a.title || a.language || 'Unknown'} — ${a.codec}</span>
            <span class="detail-item-sub">${a.channels ? a.channels + 'ch' : ''} ${a.default ? '· Default' : ''}</span>
        </div>
    `).join('') : '<div class="detail-item"><span class="detail-item-sub">No audio tracks detected</span></div>';

    let subHtml = video.subtitle_tracks.length ? video.subtitle_tracks.map(s => `
        <div class="detail-item">
            <span class="detail-item-label">${s.title || s.language || 'Unknown'} — ${s.codec}</span>
            <span class="detail-item-sub">${s.forced ? 'Forced ' : ''}${s.default ? 'Default' : ''}</span>
        </div>
    `).join('') : '<div class="detail-item"><span class="detail-item-sub">No subtitles detected</span></div>';

    elements.app.innerHTML = `
        <div class="detail-hero">
            <img src="${video.backdrop || video.thumbnail || getThumbnail(video.id)}" alt="${video.title}">
        </div>
        
        <div class="detail-content fade-in">
            <h1 class="detail-title serif">${video.title}</h1>
            <div class="detail-meta-row">
                ${video.year ? `<span>${video.year}</span><span>·</span>` : ''}
                <span>${formatDuration(video.duration)}</span>
                ${video.genres && video.genres.length ? `<span>·</span><span>${video.genres.join(' · ').toUpperCase()}</span>` : ''}
            </div>
            
            ${video.description ? `<p style="max-width: 800px; margin-bottom: 4rem; color: var(--text-muted); font-size: 0.85rem; line-height: 1.8;">${video.description}</p>` : ''}
            
            <div class="detail-actions">
                <a href="#/watch/${video.id}" class="detail-watch-btn">Watch &rarr;</a>
                <button class="detail-fav-btn" id="favBtn" data-id="${video.id}">
                    ${isFav ? '★ Favorited' : '☆ Add to favorites'}
                </button>
            </div>
            
            <div class="detail-grid">
                <div class="detail-col">
                    <h3>About</h3>
                    <div class="detail-list">
                        ${video.director ? `
                        <div class="detail-item">
                            <span class="detail-item-label">Director</span>
                            <span class="detail-item-sub">${video.director}</span>
                        </div>` : ''}
                        ${video.rating ? `
                        <div class="detail-item">
                            <span class="detail-item-label">TMDB Rating</span>
                            <span class="detail-item-sub">${video.rating}</span>
                        </div>` : ''}
                        ${video.original_language ? `
                        <div class="detail-item">
                            <span class="detail-item-label">Language</span>
                            <span class="detail-item-sub">${video.original_language.toUpperCase()}</span>
                        </div>` : ''}
                    </div>
                </div>

                <div class="detail-col">
                    <h3>File information</h3>
                    <div class="detail-list">
                        <div class="detail-item">
                            <span class="detail-item-label">File</span>
                            <span class="detail-item-sub" style="word-break: break-all;">${video.filename}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-item-label">Resolution</span>
                            <span class="detail-item-sub">${video.video.width} × ${video.video.height}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-item-label">Video Codec</span>
                            <span class="detail-item-sub">${video.video.codec.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
                
                <div class="detail-col">
                    <h3>Audio tracks</h3>
                    <div class="detail-list">${audioHtml}</div>
                </div>
            </div>
            
            ${video.cast ? `
            <div class="detail-grid" style="border-top: none; padding-top: 0;">
                <div class="detail-col" style="grid-column: 1/-1;">
                    <h3>Cast</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 2rem; color: var(--text-muted); font-size: 0.9rem;">
                        ${(typeof video.cast === 'string' ? JSON.parse(video.cast) : video.cast).map(c => `<div><div style="color: var(--text);">${c.name}</div><div>${c.character}</div></div>`).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
            
            <div class="detail-grid" style="border-top: none; padding-top: 0; margin-bottom: 10rem;">
                <div class="detail-col">
                    <h3>Subtitles</h3>
                    <div class="detail-list">${subHtml}</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('favBtn').addEventListener('click', (e) => {
        const btn = e.target;
        if (state.favorites.includes(video.id)) {
            state.favorites = state.favorites.filter(id => id !== video.id);
            btn.innerHTML = '☆ ADD TO FAVORITES';
        } else {
            state.favorites.push(video.id);
            btn.innerHTML = '★ FAVORITED';
        }
        localStorage.setItem('watch_favorites', JSON.stringify(state.favorites));
    });
}

async function renderStream(url) {
    if (!url) {
        elements.app.innerHTML = `<div class="empty-state"><h2 class="serif">No URL</h2><p>Please provide a valid stream URL.</p></div>`;
        return;
    }
    
    // Create a mock video object to satisfy WatchPlayer
    const isHls = url.includes('.m3u8');
    const mockVideo = {
        id: 'direct-stream',
        title: url.split('/').pop() || 'Direct Stream',
        duration: 0,
        playback_data: {
            video_id: 'direct-stream',
            mode: isHls ? 'hls' : 'direct',
            source: {
                url: url,
                type: isHls ? 'application/vnd.apple.mpegurl' : 'video/mp4'
            },
            audio_tracks: [],
            subtitle_tracks: [],
            chapters: []
        }
    };

    elements.app.innerHTML = `
        <div class="watch-page fade-in">
            <div class="mobile-only" style="margin-bottom: 40px; padding: 0 20px; position: relative; z-index: 10;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <a href="javascript:history.back()" style="color: var(--text); text-decoration: none; opacity: 0.8; font-size: 1.5rem;">&larr;</a>
                    <h1 class="serif" style="margin: 0; font-size: 1.5rem; color: var(--text-muted); word-break: break-all;">${mockVideo.title}</h1>
                </div>
            </div>
            
            <div id="playerRoot" style="margin-bottom: 20px; width: 100%;"></div>
            
            <div class="watch-metadata" style="padding: 0 20px;">
                <h2 class="serif" style="margin-bottom: 0.5rem; font-size: 2rem; word-break: break-all;">${mockVideo.title}</h2>
                <div class="detail-item">
                    <span class="detail-item-label">Source URL</span>
                    <span class="detail-item-sub" style="word-break: break-all;">${url}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-item-label">Stream Type</span>
                    <span class="detail-item-sub">${isHls ? 'HLS (Adaptive)' : 'Direct (MP4/MKV)'}</span>
                </div>
            </div>
        </div>
    `;
    
    const root = document.getElementById('playerRoot');
    
    // Initialize the player directly with the mock video data (which contains playback_data)
    // This will bypass the API fetch and directly play the URL.
    const player = new WatchPlayer(root, mockVideo, API_URL);
    
    // Auto-play the custom stream after a small delay
    setTimeout(() => {
        if (player.els && player.els.video) {
            player.els.video.play().catch(e => console.log('Autoplay prevented:', e));
            player.state.playing = true;
            player.updatePlayStateUI();
        }
    }, 500);
}

async function renderWatch(id) {
    const video = await fetchVideoDetails(id);
    if (!video) {
        elements.app.innerHTML = `<div class="empty-state"><h2 class="serif">Not found</h2><p>This media could not be located.</p></div>`;
        return;
    }
    
    let audioHtml = video.audio_tracks.length ? video.audio_tracks.map(a => `
        <div class="detail-item">
            <span class="detail-item-label">${a.title || a.language || 'Unknown'} — ${a.codec}</span>
            <span class="detail-item-sub">${a.channels ? a.channels + 'ch' : ''} ${a.default ? '· Default' : ''}</span>
        </div>
    `).join('') : '<div class="detail-item"><span class="detail-item-sub">No audio tracks detected</span></div>';

    let subHtml = video.subtitle_tracks.length ? video.subtitle_tracks.map(s => `
        <div class="detail-item">
            <span class="detail-item-label">${s.title || s.language || 'Unknown'} — ${s.codec}</span>
            <span class="detail-item-sub">${s.forced ? 'Forced ' : ''}${s.default ? 'Default' : ''}</span>
        </div>
    `).join('') : '<div class="detail-item"><span class="detail-item-sub">No subtitles detected</span></div>';

    elements.app.innerHTML = `
        <div class="watch-page fade-in">
            <div class="mobile-only" style="margin-bottom: 40px; padding: 0 20px; position: relative; z-index: 10;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <a href="javascript:history.back()" style="color: var(--text); text-decoration: none; opacity: 0.8; font-size: 1.5rem;">&larr;</a>
                    <h1 class="serif" style="margin: 0; font-size: 1.5rem; color: var(--text-muted);">${video.title}</h1>
                </div>
            </div>
            
            <div id="playerRoot" style="margin-bottom: 20px; width: 100%;"></div>
            
            <div class="watch-metadata" style="padding: 0 20px;">
                <h2 class="serif" style="margin-bottom: 0.5rem; font-size: 2rem;">${video.title}</h2>
                <div class="detail-meta-row" style="margin-bottom: 2rem;">
                    ${video.year ? `<span>${video.year}</span><span>·</span>` : ''}
                    <span>${formatDuration(video.duration)}</span>
                    ${video.genres && video.genres.length ? `<span>·</span><span>${video.genres.join(' · ').toUpperCase()}</span>` : ''}
                </div>
                
                ${video.description ? `<p style="max-width: 800px; margin-bottom: 4rem; color: var(--text-muted); font-size: 0.85rem; line-height: 1.8;">${video.description}</p>` : ''}
                
                <div class="detail-grid">
                    <div class="detail-col">
                        <h3>Audio Tracks</h3>
                        <div class="detail-list">
                            ${audioHtml}
                        </div>
                    </div>
                    <div class="detail-col">
                        <h3>Subtitles</h3>
                        <div class="detail-list">
                            ${subHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const root = document.getElementById('playerRoot');
    new WatchPlayer(root, video, API_URL);
}

// Components
function createVideoCard(video) {
    const dur = formatDuration(video.duration);
    const meta = [video.year, dur].filter(Boolean).join(' · ');
    
    return `
        <a href="#/video/${video.id}" class="video-card">
            <div class="video-card-img-wrapper" style="aspect-ratio: 2/3;">
                <img src="${video.poster || video.thumbnail || getThumbnail(video.id)}" loading="lazy" alt="${video.title}">
            </div>
            <div class="video-card-info">
                <div class="video-card-title">${video.title}</div>
                <div class="video-card-meta">${meta}</div>
            </div>
        </a>
    `;
}

// UI Utilities
function showToast(html) {
    elements.toast.innerHTML = html;
    elements.toast.classList.remove('hidden');
    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 4000);
}

function toggleMenu() {
    elements.menuOverlay.classList.toggle('hidden');
}

// Init
function init() {

    // Handle Loading Screen
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.add('finished');
            setTimeout(() => loader.remove(), 1000);
        }
    }, 2200);

    window.addEventListener('hashchange', navigate);
    
    elements.menuBtn.addEventListener('click', toggleMenu);
    elements.mobileMenuBtn.addEventListener('click', (e) => { e.preventDefault(); toggleMenu(); });
    elements.closeMenuBtn.addEventListener('click', toggleMenu);
    
    // Close menu when clicking a link
    document.querySelectorAll('.menu-link').forEach(link => {
        if (link.id !== 'menuRefreshBtn') {
            link.addEventListener('click', () => elements.menuOverlay.classList.add('hidden'));
        }
    });

    elements.refreshBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.menuOverlay.classList.add('hidden');
            triggerRefresh();
        });
    });

    navigate();
}

init();
