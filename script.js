const app = {
    state: {
        customContent: [],
        tmdbContent: {
            trending: [],
            topRated: [],
            action: [],
            comedy: []
        },
        config: {
            tmdbBaseUrl: 'https://api.themoviedb.org/3',
            imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
            backdropBaseUrl: 'https://image.tmdb.org/t/p/original',
            apiKey: localStorage.getItem('netflix_tmdb_key') || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkNTgyYTViZjExMzYxZjk3ZjI5NDZjYmIxY2M1NWNlOCIsIm5iZiI6MTc2ODI0MTU5MS43ODcwMDAyLCJzdWIiOiI2OTY1MzliNzA4ZDVkZWIzNzJkNGYyZTgiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.Ive1s9eS7xNXn-d9k_iD3uThBcxrlyYdD1zMj1wQDFM'
        }
    },

    storage: {
        dbName: 'NetflixCloneDB',
        storeName: 'files',
        dbPromise: null,

        open: () => {
            if (app.storage.dbPromise) return app.storage.dbPromise;
            app.storage.dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(app.storage.dbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(app.storage.storeName)) {
                        db.createObjectStore(app.storage.storeName);
                    }
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
            return app.storage.dbPromise;
        },

        saveFile: async (id, file) => {
            const db = await app.storage.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(app.storage.storeName, 'readwrite');
                const store = tx.objectStore(app.storage.storeName);
                const req = store.put(file, id);
                req.onsuccess = () => resolve(id);
                req.onerror = () => reject(req.error);
            });
        },

        getFile: async (id) => {
            const db = await app.storage.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(app.storage.storeName, 'readonly');
                const store = tx.objectStore(app.storage.storeName);
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        },

        deleteFile: async (id) => {
            const db = await app.storage.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(app.storage.storeName, 'readwrite');
                const store = tx.objectStore(app.storage.storeName);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    },

    auth: {
        check: () => {
            return !!localStorage.getItem('netflix_user_session');
        },
        login: () => {
            // Simplified login for portfolio mode
            localStorage.setItem('netflix_user_session', 'true');
            location.reload();
        },
        logout: () => {
            if (confirm('Are you sure you want to sign out?')) {
                localStorage.removeItem('netflix_user_session');
                location.reload();
            }
        },
        showLanding: () => {
            document.getElementById('landing-view').classList.remove('hidden');
            document.getElementById('app-view').classList.add('hidden');
            lucide.createIcons();
        },
        showApp: async () => {
            document.getElementById('landing-view').classList.add('hidden');
            document.getElementById('app-view').classList.remove('hidden');

            // Initialize App Logic

            // Navbar scroll effect
            window.addEventListener('scroll', () => {
                const navbar = document.getElementById('navbar');
                if (navbar) {
                    if (window.scrollY > 50) navbar.classList.add('scrolled');
                    else navbar.classList.remove('scrolled');
                }
            });

            // Load custom content
            const stored = localStorage.getItem('netflix_custom_content');
            let localContent = [];
            if (stored) {
                try {
                    localContent = JSON.parse(stored);
                } catch (e) {
                    console.error("Failed to parse custom content", e);
                }
            }

            // Merge with Initial/Published Content (Removing duplicates by ID)
            const publishedContent = window.NETFLIX_INITIAL_CONTENT || [];
            const allContentMap = new Map();

            // Add published first
            publishedContent.forEach(item => allContentMap.set(item.id, item));

            // Add local, BUT IGNORE 'friends_s1_full' to force using the hardcoded version
            localContent.filter(item => item.id !== 'friends_s1_full').forEach(localItem => {
                allContentMap.set(localItem.id, localItem);
            });

            app.state.customContent = Array.from(allContentMap.values());

            // Fetch Data
            await app.services.loadContent();

            // FORCE SYNC: Ensure hardcoded links are written to LocalStorage so they "stick"
            const currentLocal = JSON.parse(localStorage.getItem('netflix_custom_content') || '[]');
            let changed = false;

            if (window.NETFLIX_INITIAL_CONTENT) {
                window.NETFLIX_INITIAL_CONTENT.forEach(hardcodedItem => {
                    const localMatch = currentLocal.find(l => l.id === hardcodedItem.id);
                    if (localMatch && hardcodedItem.episodes && localMatch.episodes) {
                        localMatch.episodes.forEach((locEp, idx) => {
                            const hardEp = hardcodedItem.episodes[idx];
                            if (hardEp && hardEp.video_url && (!locEp.video_url || locEp.video_url.trim() === '')) {
                                locEp.video_url = hardEp.video_url;
                                // Consolidate view/preview format
                                if (locEp.video_url.includes('drive.google.com') && locEp.video_url.includes('/view')) {
                                    locEp.video_url = locEp.video_url.replace('/view', '/preview');
                                }
                                changed = true;
                            }
                            // Same for captions
                            if (hardEp && hardEp.caption_url && (!locEp.caption_url || locEp.caption_url.trim() === '')) {
                                locEp.caption_url = hardEp.caption_url;
                                changed = true;
                            }
                        });
                    }
                });
            }

            if (changed) {
                localStorage.setItem('netflix_custom_content', JSON.stringify(currentLocal));
                // Reload state from the newly updated storage
                app.state.customContent = currentLocal;
                console.log("Force Sync: Updated LocalStorage with Hardcoded Links.");
            }

            // Search Logic
            const searchIcon = document.querySelector('.search-icon');
            const searchBox = document.querySelector('.search-box');
            const searchInput = document.getElementById('search-input');
            const searchClose = document.querySelector('.search-close');

            searchIcon.addEventListener('click', () => {
                searchBox.classList.add('active');
                searchInput.focus();
                // Fix: ensure the input has the correct class
                searchInput.className = 'search-input';
                searchClose.classList.remove('hidden');
            });

            searchClose.addEventListener('click', () => {
                searchBox.classList.remove('active');
                searchInput.classList.remove('active');
                searchClose.classList.add('hidden');
                searchInput.value = '';
                // Go back to previous hash or home
                window.location.hash = 'home';
            });

            // Profile Dropdown
            const profileMenu = document.querySelector('.profile-menu');
            const dropdown = document.getElementById('profile-dropdown');
            const chevron = profileMenu.querySelector('i[data-lucide="chevron-down"]');

            profileMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
                // Rotate chevron
                if (!dropdown.classList.contains('hidden')) {
                    chevron.style.transform = 'rotate(180deg)';
                } else {
                    chevron.style.transform = 'rotate(0deg)';
                }
            });

            document.addEventListener('click', (e) => {
                if (!profileMenu.contains(e.target)) {
                    dropdown.classList.add('hidden');
                    chevron.style.transform = 'rotate(0deg)';
                }
            });

            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                if (query.length > 2) {
                    app.pages.search(document.getElementById('main-content'), query);
                } else if (query.length === 0) {
                    window.location.hash = 'home';
                }
            });

            // Initial Route
            app.router.handleHash();
            window.addEventListener('hashchange', app.router.handleHash);

            lucide.createIcons();
        }
    },

    init: async () => {
        console.log('Netflix Clone Initializing...');

        try {
            // Safety check for Lucide
            if (typeof lucide === 'undefined') {
                console.warn('Lucide icons not loaded. Icons will be missing.');
                window.lucide = { createIcons: () => { } };
            }

            // Safety for Initial Content
            if (typeof window.NETFLIX_INITIAL_CONTENT === 'undefined') {
                console.warn('Initial content not loaded.');
                window.NETFLIX_INITIAL_CONTENT = [];
            } else {
                // FORCE UPDATE FRIENDS DATA IF IT EXISTS
                // This ensures that hardcoded updates to initialContent.js (like adding S2) are applied
                // even if the user has a stale version saved in IndexedDB.
                const freshFriends = window.NETFLIX_INITIAL_CONTENT.find(i => i.id === 'friends_s1_full');
                if (freshFriends) {
                    try {
                        const currentLocal = JSON.parse(localStorage.getItem('netflix_custom_content') || '[]');
                        const idx = currentLocal.findIndex(i => i.id === 'friends_s1_full');
                        if (idx !== -1) {
                            // OVERWRITE completely
                            currentLocal[idx] = freshFriends;
                        } else {
                            currentLocal.push(freshFriends);
                        }
                        localStorage.setItem('netflix_custom_content', JSON.stringify(currentLocal));
                        console.log('Forced update of Friends data. Episodes count:', freshFriends.episodes.length);
                    } catch (e) {
                        console.error("Failed to force update Friends", e);
                    }
                }
            }

            if (app.auth.check()) {
                await app.auth.showApp();
            } else {
                app.auth.showLanding();
            }
        } catch (err) {
            console.error('App Init Failed:', err);
            document.body.innerHTML = `<div style="color:red; padding:20px;"><h1>Error Initializing App</h1><p>${err.message}</p></div>`;
        }
    },

    router: {
        handleHash: () => {
            const hash = window.location.hash.substring(1) || 'home';
            const main = document.getElementById('main-content');

            // Close modals on navigation
            document.getElementById('modal-container').classList.add('hidden');
            const playerModal = document.getElementById('player-container');
            if (playerModal) {
                playerModal.classList.add('hidden');
                playerModal.innerHTML = ''; // cleanup video processing
            }
            window.scrollTo(0, 0);

            // Update Active Link
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + hash) link.classList.add('active');
            });

            if (hash === 'home') app.pages.home(main);
            else if (hash === 'tv') app.pages.tv(main);
            else if (hash === 'movies') app.pages.movies(main);
            else if (hash === 'custom') app.pages.custom(main);
            else if (hash === 'add') app.pages.addContent(main);
            else if (hash.startsWith('edit=')) {
                const id = hash.split('=')[1];
                app.pages.addContent(main, id);
            }
            else if (hash === 'settings') app.pages.settings(main);
            else app.pages.home(main);

            lucide.createIcons();
        },

        openPlayer: async (videoUrl, captionUrl = null, itemId = null, episodeIndex = null) => {
            // FAILSAFE: If videoUrl is missing, check Hardcoded Content
            if ((!videoUrl || videoUrl.trim() === '') && itemId && episodeIndex !== null && window.NETFLIX_INITIAL_CONTENT) {
                const hardcodedItem = window.NETFLIX_INITIAL_CONTENT.find(h => h.id === itemId);
                if (hardcodedItem && hardcodedItem.episodes && hardcodedItem.episodes[episodeIndex]) {
                    const fallbackEp = hardcodedItem.episodes[episodeIndex];
                    if (fallbackEp.video_url) {
                        console.log("Using Hardcoded Fallback URL for Episode");
                        videoUrl = fallbackEp.video_url;
                        if (!captionUrl) captionUrl = fallbackEp.caption_url;
                    }
                }
            }

            if (!videoUrl) return alert("No video URL available!");

            // Helper to convert SRT to VTT
            const srtToVtt = (srtText) => {
                let vtt = "WEBVTT\n\n";
                // Regex to match SRT time format: 00:00:20,000 --> 00:00:24,400
                vtt += srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                return vtt;
            };

            // Handle IDB Persistence for Video
            if (videoUrl.startsWith('idb://')) {
                const fileId = videoUrl.replace('idb://', '');
                try {
                    const blob = await app.storage.getFile(fileId);
                    if (blob) {
                        videoUrl = URL.createObjectURL(blob);
                    } else {
                        return alert("Video file not found in storage (it might have been deleted).");
                    }
                } catch (e) {
                    console.error("Failed to load video from IDB", e);
                    return alert("Error loading stored video.");
                }
            }

            // Handle IDB Persistence for Captions & Conversion
            if (captionUrl && captionUrl.startsWith('idb://')) {
                const capId = captionUrl.replace('idb://', '');
                try {
                    const file = await app.storage.getFile(capId);
                    if (file) {
                        // Check for SRT
                        if (file.name.toLowerCase().endsWith('.srt') || file.type.includes('subrip')) {
                            const text = await file.text();
                            const vttText = srtToVtt(text);
                            const vttBlob = new Blob([vttText], { type: 'text/vtt' });
                            captionUrl = URL.createObjectURL(vttBlob);
                        } else {
                            captionUrl = URL.createObjectURL(file);
                        }
                    }
                } catch (e) { console.error("Failed to load caption", e); }
            }

            const modal = document.getElementById('player-container');
            modal.classList.remove('hidden');

            // 1. Process URLs first
            // Handle Dropbox Links (Convert dl=0 -> dl=1 for Direct Stream)
            let isDropboxStream = false;
            if (videoUrl.includes('dropbox.com')) {
                videoUrl = videoUrl.replace('dl=0', 'dl=1');
                isDropboxStream = true;
            }

            // Handle OneDrive Links (Convert embed -> download)
            let isOneDriveStream = false;
            if (videoUrl.includes('onedrive.live.com') || videoUrl.includes('1drv.ms')) {
                videoUrl = videoUrl.replace('embed', 'download');
                isOneDriveStream = true;
            }

            // Handle Google Drive "Proxy" Attempt (Preview -> View)
            // Handle Google Drive "Proxy" Attempt (Preview/View -> Download Stream)
            // Handle Google Drive - Force "Preview" Mode (Standard Embed)
            // This is the most reliable method. Proxies/Direct Downloads are blocked by CORS.
            if (videoUrl.includes('drive.google.com')) {
                // Ensure we use the embeddable /preview URL
                if (videoUrl.includes('/view')) videoUrl = videoUrl.replace('/view', '/preview');
                // Clean any query params like ?usp=drive_link which break embedding sometimes
                /* keeping params mostly harmless but cleaning is safer if we want pure embed */
            }

            // Determine if it's an iframe embed or direct video file or Blob URL
            const isDirectFile = isDropboxStream || isOneDriveStream || videoUrl.startsWith('blob:') || videoUrl.endsWith('.mp4') || videoUrl.endsWith('.m3u8') || videoUrl.endsWith('.webm');

            let isYoutube = false;
            let ytVideoId = '';
            if (!isDirectFile) {
                if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/') || videoUrl.includes('youtube.com/embed/')) {
                    const tempUrl = new URL(videoUrl);
                    if (videoUrl.includes('youtu.be/')) {
                        ytVideoId = tempUrl.pathname.substring(1);
                    } else if (videoUrl.includes('youtube.com/embed/')) {
                        ytVideoId = tempUrl.pathname.split('/').pop();
                    } else {
                        ytVideoId = tempUrl.searchParams.get('v');
                    }

                    if (ytVideoId) isYoutube = true;
                }
            }



            let playerHtml;
            if (isDirectFile) {
                playerHtml = `
                    <video controls autoplay style="width: 100%; height: 100%;" crossorigin="anonymous">
                        <source src="${videoUrl}" type="video/mp4">
                        ${captionUrl ? `<track label="English" kind="subtitles" srclang="en" src="${captionUrl}" default>` : ''}
                        Your browser does not support the video tag.
                    </video>
                `;
                modal.innerHTML = `
                    <div class="video-player-container" style="width: 100%; height: 100%; background: black; position: relative; display: flex; align-items: center; justify-content: center;">
                        <button class="close-player" onclick="app.handlers.closePlayer()" 
                            style="position: absolute; top: 20px; right: 20px; z-index: 200; background: none; border: none; color: white; cursor: pointer;">
                            <i data-lucide="x" width="40" height="40"></i>
                        </button>
                        ${playerHtml}
                    </div>
                `;
                lucide.createIcons();
            } else if (isYoutube) {
                // YouTube API Player for Custom Captions
                modal.innerHTML = `
                    <div class="video-player-container" style="width: 100%; height: 100%; background: black; position: relative; display: flex; align-items: center; justify-content: center;">
                        <div style="position: absolute; top: 20px; right: 20px; z-index: 400; display: flex; gap: 10px;">
                            <button id="toggle-custom-cc" style="background: rgba(0,0,0,0.5); border: 1px solid white; color: white; cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Toggle Custom Subtitles">
                                <i data-lucide="captions" width="24" height="24"></i>
                            </button>
                            <button class="close-player" onclick="app.handlers.closePlayer()" style="background: none; border: none; color: white; cursor: pointer;">
                                <i data-lucide="x" width="40" height="40"></i>
                            </button>
                        </div>
                        <div id="yt-player-target" style="width:100%; height:100%;"></div>
                        <div id="custom-subs" class="custom-subtitle-overlay"></div>
                    </div>
                `;
                lucide.createIcons();

                // Helper to parse VTT/SRT
                const parseSubs = (text) => {
                    const cues = [];
                    const lines = text.split(/\r?\n/);
                    let start = null, end = null, payload = [];
                    lines.forEach(line => {
                        if (line.includes('-->')) {
                            const times = line.split('-->');
                            const parseTime = (t) => {
                                const parts = t.trim().split(':');
                                let sec = 0;
                                if (parts.length === 3) {
                                    sec += parseFloat(parts[0]) * 3600;
                                    sec += parseFloat(parts[1]) * 60;
                                    sec += parseFloat(parts[2].replace(',', '.'));
                                } else if (parts.length === 2) {
                                    sec += parseFloat(parts[0]) * 60;
                                    sec += parseFloat(parts[1].replace(',', '.'));
                                } else if (parts.length === 1) { // Basic seconds check
                                    sec += parseFloat(parts[0].replace(',', '.'));
                                }
                                return sec;
                            };
                            start = parseTime(times[0]);
                            end = parseTime(times[1]);
                        } else if (line.trim() === '' && start !== null) {
                            cues.push({ s: start, e: end, t: payload.join('<br>') });
                            start = null; payload = [];
                        } else if (start !== null && !line.match(/^[0-9]+$/)) { // Skip index numbers
                            payload.push(line);
                        }
                    });
                    if (start !== null) cues.push({ s: start, e: end, t: payload.join('<br>') });
                    return cues;
                };

                let subCues = [];
                let areSubsEnabled = true;

                // Load Subtitles
                if (captionUrl) {
                    fetch(captionUrl).then(r => r.text()).then(txt => {
                        subCues = parseSubs(txt);
                        console.log("Parsed " + subCues.length + " subtitles.");
                    }).catch(e => console.error("Sub load err", e));
                } else {
                    document.getElementById('toggle-custom-cc').style.opacity = '0.3';
                    areSubsEnabled = false;
                }

                // Handle Toggle Click
                const toggleBtn = document.getElementById('toggle-custom-cc');
                toggleBtn.addEventListener('click', () => {
                    if (!captionUrl) return;
                    areSubsEnabled = !areSubsEnabled;
                    toggleBtn.style.background = areSubsEnabled ? 'rgba(0,128,0,0.5)' : 'rgba(0,0,0,0.5)';
                    if (!areSubsEnabled) document.getElementById('custom-subs').classList.remove('active');
                });
                if (captionUrl) toggleBtn.style.background = 'rgba(0,128,0,0.5)';

                // Load API
                if (!window.YT) {
                    const tag = document.createElement('script');
                    tag.src = "https://www.youtube.com/iframe_api";
                    const firstScriptTag = document.getElementsByTagName('script')[0];
                    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                }

                const initPlayer = () => {
                    let player;
                    let interval;
                    player = new YT.Player('yt-player-target', {
                        height: '100%',
                        width: '100%',
                        videoId: ytVideoId,
                        playerVars: { 'autoplay': 1, 'controls': 1, 'cc_load_policy': 1, 'iv_load_policy': 3, 'modestbranding': 1, 'rel': 0 },
                        events: {
                            'onReady': (event) => {
                                event.target.playVideo();
                                interval = setInterval(() => {
                                    if (player && player.getCurrentTime && areSubsEnabled) {
                                        const time = player.getCurrentTime();
                                        const cue = subCues.find(c => time >= c.s && time <= c.e);
                                        const subDiv = document.getElementById('custom-subs');
                                        if (cue) { subDiv.innerHTML = cue.t; subDiv.classList.add('active'); }
                                        else { subDiv.classList.remove('active'); }
                                    }
                                }, 100);
                            }
                        }
                    });

                    app.activeYoutubePlayer = player;
                    app.activeYoutubeInterval = interval;


                    // Remove old listener logic, rely on global handler
                    // document.getElementById('close-yt-player').addEventListener...
                };

                if (window.YT && window.YT.Player) { initPlayer(); } else { window.onYouTubeIframeAPIReady = initPlayer; }

            } else {
                let iframeUrl = videoUrl;
                // Clean Google Drive URLs
                if (iframeUrl.includes('drive.google.com')) {
                    // Strip query parameters (like ?usp=drive_link)
                    iframeUrl = iframeUrl.split('?')[0];
                    // Ensure preview mode
                    if (iframeUrl.includes('/view')) {
                        iframeUrl = iframeUrl.replace('/view', '/preview');
                    }
                    // aggressive HD force and autoplay attempt
                    // aggressive HD force, autoplay, and attempt to force captions
                    iframeUrl += '?mime=video/mp4&vq=hd1080&autoplay=1&cc_load_policy=1&cc_lang_pref=en&c=1';
                }

                modal.innerHTML = `
                    <div class="video-player-container" style="width: 100%; height: 100%; background: black; position: relative; display: flex; align-items: center; justify-content: center;">
                        <button class="close-player" onclick="app.handlers.closePlayer()" 
                            style="position: absolute; top: 20px; right: 20px; z-index: 200; background: none; border: none; color: white; cursor: pointer;">
                            <i data-lucide="x" width="40" height="40"></i>
                        </button>
                        <iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%; height:100%; border:none;"></iframe>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
            }
        },

        openDetails: async (item) => {
            try {
                const modal = document.getElementById('modal-container');
                modal.classList.remove('hidden');

                const isCustom = item.is_custom;

                // Image handling
                const backdropBase = app.state.config ? app.state.config.backdropBaseUrl : '';
                const posterBase = app.state.config ? app.state.config.imageBaseUrl : '';

                const imgUrl = isCustom ? item.backdrop_path : (item.backdrop_path ? backdropBase + item.backdrop_path : 'https://via.placeholder.com/800x450');
                const posterUrl = isCustom ? item.poster_path : (item.poster_path ? posterBase + item.poster_path : 'https://via.placeholder.com/200x300');

                // Episode Logic
                const hasEpisodes = item.episodes && item.episodes.length > 0;
                // Get unique seasons, sort them
                const seasons = hasEpisodes ? [...new Set(item.episodes.map(e => parseInt(e.season) || 1))].sort((a, b) => a - b) : [];
                const currentSeason = seasons.length > 0 ? seasons[0] : 1;

                // Build HTML
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="close-modal" onclick="document.getElementById('modal-container').classList.add('hidden')">
                            <i data-lucide="x"></i>
                        </div>
                        
                        <div class="modal-hero" style="background-image: url('${imgUrl}'); height: 400px; background-size: cover; background-position: center; position: relative;">
                            <div class="hero-overlay" style="background: linear-gradient(to top, #181818, transparent);"></div>
                            
                            <div class="modal-hero-content" style="position: absolute; bottom: 20px; left: 20px; right: 20px; z-index: 10;">
                                <h1 style="font-size: 3rem; margin-bottom: 10px; line-height: 1.1; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); font-weight: bold;">${item.title || item.name}</h1>
                                
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; font-size: 0.9rem; color: #ccc;">
                                    <span style="color: #46d369; font-weight: bold;">${Math.round((item.vote_average || 8) * 10)}% Match</span>
                                    <span>${item.release_date || item.first_air_date || '2024'}</span>
                                    <span style="border: 1px solid #777; padding: 0 4px; font-size: 0.7rem; border-radius: 2px;">HD</span>
                                </div>
                                
                                <div class="modal-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                    <button class="btn btn-primary" onclick="app.handlers.playMain('${item.video_url || ''}', ${hasEpisodes})">
                                        <i data-lucide="play" fill="black"></i> Play
                                    </button>
                                    
                                    ${isCustom ? `
                                        <button class="btn btn-secondary" onclick="app.handlers.editItem('${item.id}')">
                                            <i data-lucide="edit-2"></i> Edit
                                        </button>
                                        <button class="btn btn-secondary" style="background-color: #E50914; border:none;" onclick="app.handlers.deleteItem('${item.id}')">
                                            <i data-lucide="trash-2"></i> Delete
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="modal-body" style="padding: 20px;">
                            <div class="modal-tabs">
                                ${hasEpisodes ? `<button class="tab-btn active" onclick="app.handlers.switchTab(this, 'episodes')">EPISODES</button>` : ''}
                                <button class="tab-btn ${!hasEpisodes ? 'active' : ''}" onclick="app.handlers.switchTab(this, 'overview')">Overview</button>
                            </div>

                            <div id="tab-overview" class="tab-content ${hasEpisodes ? 'hidden' : ''}">
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 30px;">
                                    <div>
                                        <p style="font-size: 1.1rem; line-height: 1.6; color: #fff; margin-bottom: 20px;">
                                            ${item.overview || item.description || 'No description available.'}
                                        </p>
                                    </div>
                                    <div style="font-size: 0.9rem; color: #777;">
                                        <div style="margin-bottom: 10px;"><span style="color: #444;">Genre:</span> <span style="color: #ddd;">${item.genre || 'Various'}</span></div>
                                        <div><span style="color: #444;">Language:</span> <span style="color: #ddd;">${item.original_language || 'en'}</span></div>
                                    </div>
                                </div>
                            </div>

                            <div id="tab-episodes" class="tab-content ${!hasEpisodes ? 'hidden' : ''}">
                                ${hasEpisodes ? `
                                    <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                                        <select style="background: #333; color: white; padding: 8px 12px; border: 1px solid #555; border-radius: 4px; font-size: 1.1rem; cursor: pointer;"
                                            onchange="app.handlers.switchSeason(this, '${item.id}')">
                                            ${seasons.map(s => `<option value="${s}">Season ${s}</option>`).join('')}
                                        </select>
                                        <span id="season-ep-count" style="color: #777; font-size: 0.9rem;">${item.episodes.filter(e => (e.season || 1) == currentSeason).length} Episodes</span>
                                    </div>
                                ` : ''}

                                <div class="episode-list">
                                    ${hasEpisodes ? app.components.renderEpisodeList(item, currentSeason) : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                if (window.lucide) window.lucide.createIcons();

                // Trigger duration logic
                if (hasEpisodes) {
                    app.services.populateDurations(item, currentSeason);
                }

                // Store current item for playMain fallback
                window.currentItem = item;

            } catch (e) {
                console.error("Error opening details:", e);
                alert("Could not open details. See console.");
            }
        }
    },

    handlers: {
        openDetailsById: (id) => {
            const item = app.services.findItemById(id);
            if (item) {
                app.router.openDetails(item);
            } else {
                console.error("Item not found:", id);
            }
        },
        playHero: () => {
            const item = window.currentHeroItem;
            if (item) {
                if (item.episodes && item.episodes.length > 0) {
                    app.router.openPlayer(item.episodes[0].video_url, item.episodes[0].caption_url);
                } else if (item.video_url) {
                    app.router.openPlayer(item.video_url, item.caption_url);
                } else {
                    app.router.openPlayer('https://www.youtube.com/embed/dQw4w9WgXcQ');
                }
            }
        },
        playMain: (url, hasEpisodes) => {
            if (hasEpisodes && window.currentItem && window.currentItem.episodes.length > 0) {
                // Play first episode
                app.router.openPlayer(window.currentItem.episodes[0].video_url, window.currentItem.episodes[0].caption_url);
            } else if (url && url !== 'undefined') {
                app.router.openPlayer(url);
            } else {
                // If no video, open details instead of Rick Rolling
                // If we are already IN details (which playMain usually is), this might be redundant but better than the fallback
                if (window.currentItem) {
                    // Reuse the openDetails logic? No, just alert or do nothing? 
                    // Actually, let's just show an alert or a trailer search if possible.
                    // But for now, specifically remove the Rick Roll.
                    console.warn("No video URL found for this item.");
                    alert("Video not available for this title.");
                }
            }
        },
        switchSeason: (ele, itemId) => {
            const season = parseInt(ele.value);
            let item = app.state.customContent.find(i => i.id == itemId);
            if (!item) {
                const all = [...app.state.tmdbContent.trending, ...app.state.tmdbContent.topRated, ...app.state.tmdbContent.action];
                item = all.find(i => i.id == itemId);
            }
            if (item) {
                document.querySelector('.episode-list').innerHTML = app.components.renderEpisodeList(item, season);
                app.services.populateDurations(item, season);
                // Update the episode count text next to dropdown
                const countSpan = document.getElementById('season-ep-count');
                if (countSpan) {
                    countSpan.textContent = item.episodes.filter(e => (e.season || 1) == season).length + ' Episodes';
                }
            }
        },

        switchTab: (btn, tabId) => {
            // Update buttons
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById('tab-' + tabId).classList.remove('hidden');
        },
        addEpisodeField: (data = null) => {
            const container = document.getElementById('episodes-container');
            const count = container.children.length + 1;
            const div = document.createElement('div');
            div.className = 'episode-input-group';
            div.style.marginBottom = '15px';
            div.style.padding = '15px';
            div.style.background = '#222';
            div.style.borderRadius = '4px';

            const titleVal = data ? (data.title || '') : '';
            const descVal = data ? (data.overview || '') : '';
            const urlVal = data ? (data.video_url || '') : '';
            const capVal = data ? (data.caption_url || '') : '';

            div.innerHTML = `
    < div style = "display:flex; justify-content:space-between;" >
            <h4 style="margin-bottom: 10px; color: #ddd;">Episode / Video ${count}</h4>
            <div style="display:flex; align-items:center; gap:10px;">
                <label style="font-size:0.8rem; color:#aaa;">Season:</label>
                <input type="number" name="ep_season_${count}" min="1" value="${data ? (data.season || 1) : 1}" style="width:50px; padding:2px; background:#333; border:none; color:white; border-radius:3px;">
                ${count > 1 ? `<button type="button" onclick="this.closest('.episode-input-group').remove()" style="background:none; border:none; color:#e50914; cursor:pointer;">Remove</button>` : ''}
            </div>
        </div >
    <input type="text" name="ep_title_${count}" placeholder="Title (e.g. 'Full Movie' or 'S1E1: Pilot')" value="${titleVal}" required style="margin-bottom: 10px;">
        <div style="display:flex; gap:10px; margin-bottom:10px;">
            <input type="text" name="ep_desc_${count}" placeholder="Description" value="${descVal}" style="flex-grow:1;">
                <input type="hidden" name="ep_dur_${count}" value="${data ? (data.runtime || data.duration || '') : ''}">
                </div>
                <input type="url" name="ep_url_${count}" placeholder="Video URL" value="${urlVal}" required style="margin-bottom: 10px;">
                    <input type="url" name="ep_cap_${count}" placeholder="Captions URL (.vtt)">
                        `;
            container.appendChild(div);
        },
        addFileUploadField: (data = null) => {
            const container = document.getElementById('file-episodes-container');
            const count = container.children.length + 1;
            const div = document.createElement('div');
            div.className = 'file-episode-group';
            div.style.marginBottom = '15px';
            div.style.padding = '15px';
            div.style.background = '#222';
            div.style.borderRadius = '4px';

            const titleVal = data ? (data.title || '') : '';
            const descVal = data ? (data.overview || '') : '';
            const vidVal = data ? (data.video_url || '') : '';
            const capVal = data ? (data.caption_url || '') : '';

            div.innerHTML = `
                        <div style="display:flex; justify-content:space-between;">
                            <h4 style="margin-bottom: 10px; color: #ddd;">Episode / Video ${count}</h4>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <label style="font-size:0.8rem; color:#aaa;">Season:</label>
                                <input type="number" class="file-season-input" min="1" value="${data ? (data.season || 1) : 1}" style="width:50px; padding:2px; background:#333; border:none; color:white; border-radius:3px;">
                                    ${count > 1 ? `<button type="button" onclick="this.closest('.file-episode-group').remove()" style="background:none; border:none; color:#e50914; cursor:pointer;">Remove</button>` : ''}
                            </div>
                        </div>
                        <input type="hidden" class="original-video-url" value="${vidVal}">
                            <input type="hidden" class="original-caption-url" value="${capVal}">

                                <input type="text" class="file-title-input" placeholder="Episode Title (e.g. 'My Movie')" value="${titleVal}" style="margin-bottom: 10px;">
                                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                                        <input type="text" class="file-desc-input" placeholder="Episode Description" value="${descVal}" style="flex-grow:1;">
                                            <input type="hidden" class="file-runtime-input" value="${data ? (data.runtime || '') : ''}">
                                            </div>

                                            <div style="margin-bottom: 10px; padding: 10px; border: 1px dashed #444; border-radius: 4px;">
                                                <label style="display:block; margin-bottom: 5px; color: #ccc;">Video File:</label>
                                                <input type="file" class="video-file-input" accept="video/mp4,video/webm,video/ogg,video/x-matroska,.mkv" style="width: 100%; margin-bottom: 5px;">
                                                    <div style="text-align: center; color: #666; font-size: 0.8rem; margin: 5px 0;">-- OR --</div>
                                                    <input type="text" class="video-url-input" placeholder="Paste Video URL (Drive, Dropbox, etc.)" value="${vidVal && !vidVal.startsWith('idb://') ? vidVal : ''}" style="width: 100%; background: #1a1a1a; border: 1px solid #333; color: white; padding: 5px;">

                                                        ${vidVal ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                            <p style="font-size: 0.8rem; color: #46d369; margin:0;">Currently set: ${vidVal.startsWith('idb://') ? 'Local File' : 'External URL'}</p>
                            <label style="font-size: 0.8rem; color: #e50914; display:flex; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="clear-video-cb" style="margin-right:5px;"> Remove
                            </label>
                        </div>
                    ` : ''}
                                                    </div>

                                                    <div style="padding: 10px; border: 1px dashed #444; border-radius: 4px;">
                                                        <label style="display:block; margin-bottom: 5px; color: #ccc;">Captions File (.vtt/.srt):</label>
                                                        <input type="file" class="caption-file-input" accept=".vtt,.srt" style="width: 100%; margin-bottom: 5px;">
                                                            <div style="text-align: center; color: #666; font-size: 0.8rem; margin: 5px 0;">-- OR --</div>
                                                            <input type="text" class="caption-url-input" placeholder="Paste Caption URL" value="${capVal && !capVal.startsWith('idb://') ? capVal : ''}" style="width: 100%; background: #1a1a1a; border: 1px solid #333; color: white; padding: 5px;">

                                                                ${capVal ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                            <p style="font-size: 0.8rem; color: #46d369; margin:0;">Currently set: ${capVal.startsWith('idb://') ? 'Local File' : 'External URL'}</p>
                            <label style="font-size: 0.8rem; color: #e50914; display:flex; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="clear-caption-cb" style="margin-right:5px;"> Remove
                            </label>
                        </div>
                    ` : ''}
                                                            </div>
                                                            `;


            const vidInputEl = div.querySelector('.video-file-input');
            const urlInputEl = div.querySelector('.video-url-input');

            // Helper to update runtime
            const updateRuntime = (source, isFile = true) => {
                const tempVid = document.createElement('video');
                tempVid.preload = 'metadata';
                tempVid.src = isFile ? URL.createObjectURL(source) : source;

                // Handle CORS for URLs if possible
                if (!isFile) tempVid.crossOrigin = "anonymous";

                tempVid.onloadedmetadata = () => {
                    if (tempVid.duration && isFinite(tempVid.duration)) {
                        const mins = Math.round(tempVid.duration / 60);
                        const durInput = div.querySelector('.file-runtime-input');
                        if (durInput) durInput.value = mins;
                    }
                    if (isFile) URL.revokeObjectURL(tempVid.src);
                };
                // Clean up on error
                tempVid.onerror = () => { if (isFile) URL.revokeObjectURL(tempVid.src); };
            };

            vidInputEl.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) updateRuntime(file, true);
            });

            urlInputEl.addEventListener('blur', (e) => {
                if (e.target.value) updateRuntime(e.target.value, false);
            });

            container.appendChild(div);
        },
        deleteItem: (id) => {
            if (confirm("Are you sure you want to delete this title?")) {
                const item = app.state.customContent.find(i => i.id == id);
                if (item && item.episodes) {
                    // Clean up storage
                    item.episodes.forEach(ep => {
                        if (ep.video_url && ep.video_url.startsWith('idb://')) app.storage.deleteFile(ep.video_url.replace('idb://', ''));
                        if (ep.caption_url && ep.caption_url.startsWith('idb://')) app.storage.deleteFile(ep.caption_url.replace('idb://', ''));
                    });
                }
                app.state.customContent = app.state.customContent.filter(i => i.id != id);
                localStorage.setItem('netflix_custom_content', JSON.stringify(app.state.customContent));
                document.getElementById('modal-container').classList.add('hidden');
                // Refresh if on custom page
                if (window.location.hash === '#custom') app.pages.custom(document.getElementById('main-content'));
                else window.location.hash = 'custom';
            }
        },
        // State for Editing
        editingSeasons: [1],
        editingCurrentSeason: 1,

        addNewSeason: () => {
            const nextSeason = Math.max(...app.handlers.editingSeasons) + 1;
            app.handlers.editingSeasons.push(nextSeason);
            app.handlers.renderSeasonSelector();
            app.handlers.switchEditSeason(nextSeason);
        },

        renderSeasonSelector: () => {
            const list = document.getElementById('edit-season-list');
            if (!list) return;

            list.innerHTML = app.handlers.editingSeasons.map(s => `
                                                            <button type="button" class="season-btn ${s === app.handlers.editingCurrentSeason ? 'active' : ''}"
                                                                onclick="app.handlers.switchEditSeason(${s})">
                                                                Season ${s}
                                                            </button>
                                                            `).join('');
        },

        switchEditSeason: (seasonNum) => {
            app.handlers.editingCurrentSeason = seasonNum;
            app.handlers.renderSeasonSelector(); // Update active class

            // Filter Episodes in UI
            const groups = document.querySelectorAll('.episode-input-group');
            groups.forEach(grp => {
                const grpSeason = parseInt(grp.dataset.season || 1);
                if (grpSeason === seasonNum) {
                    grp.style.display = 'block';
                } else {
                    grp.style.display = 'none';
                }
            });
        },

        addEpisodeField: (episodeData = null) => {
            const container = document.getElementById('episodes-container');
            const index = container.children.length + 1;

            // Determine Season
            let season = app.handlers.editingCurrentSeason || 1;
            if (episodeData && episodeData.season) season = episodeData.season;

            const div = document.createElement('div');
            div.className = 'episode-input-group';
            div.dataset.season = season; // Tag it for filtering

            // Initial Visibility Check
            if (season !== app.handlers.editingCurrentSeason) {
                div.style.display = 'none';
            }

            div.innerHTML = `
                                                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                                                <h4>Video / Episode ${index} <span style="font-weight:normal; color:#777; font-size:0.8rem;">(Season ${season})</span></h4>
                                                                <button type="button" style="background:none; border:none; color:red; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">Remove</button>
                                                            </div>
                                                            <input type="hidden" name="ep_season_${index}" value="${season}"> <!-- Hidden Season Input -->
                                                                <input type="text" name="ep_title_${index}" placeholder="Title" value="${episodeData ? episodeData.title : ''}" required>
                                                                    <textarea name="ep_desc_${index}" placeholder="Episode Overview/Description" style="width:100%; height:80px; margin-bottom:10px; background:#333; color:white; border:none; padding:10px;">${episodeData ? (episodeData.overview || episodeData.description || '') : ''}</textarea>
                                                                    <input type="url" name="ep_url_${index}" placeholder="Video URL" value="${episodeData ? episodeData.video_url : ''}" style="margin-bottom: 10px;">
                                                                        <input type="url" name="ep_cap_${index}" placeholder="Captions URL (.vtt)" value="${episodeData ? episodeData.caption_url : ''}">
                                                                            `;
            container.appendChild(div);
        },

        exportLibrary: async () => {
            const cleanContent = [];

            // Process sequentially to handle async DB lookups
            for (const item of app.state.customContent) {
                const newItem = JSON.parse(JSON.stringify(item));

                // Helper to Process URL
                const processUrl = async (url) => {
                    if (url && url.startsWith('idb://')) {
                        const id = url.replace('idb://', '');
                        try {
                            const fileData = await app.storage.getFile(id);
                            if (fileData) return `assets/${fileData.name}`;
                        } catch (e) { console.error('Export error', e); }
                        return ''; // Fallback if file missing
                    }
                    return url;
                };

                newItem.video_url = await processUrl(newItem.video_url);
                newItem.caption_url = await processUrl(newItem.caption_url);

                if (newItem.episodes) {
                    for (let i = 0; i < newItem.episodes.length; i++) {
                        newItem.episodes[i].video_url = await processUrl(newItem.episodes[i].video_url);
                        newItem.episodes[i].caption_url = await processUrl(newItem.episodes[i].caption_url);
                    }
                }
                cleanContent.push(newItem);
            }

            const json = JSON.stringify(cleanContent, null, 4);
            const code = `window.NETFLIX_INITIAL_CONTENT = ${json};`;

            // Create a modal to show code or download file
            const blob = new Blob([code], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'initialContent.js';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            alert("EXPORT SUCCESSFUL!\n\nTo make your videos playable for everyone:\n\n1. Replace 'src/initialContent.js' with this downloaded file.\n2. Copy your actual video/subtitle files into the 'src/assets' folder.\n\nNote: Ensure filenames match exactly!");
        },

        editItem: (id) => {
            document.getElementById('modal-container').classList.add('hidden');
            window.location.hash = `edit=${id}`;
        },

        closePlayer: () => {
            const modal = document.getElementById('player-container');

            // cleanup YouTube
            if (app.activeYoutubePlayer && app.activeYoutubePlayer.destroy) {
                try { app.activeYoutubePlayer.destroy(); } catch (e) { }
            }
            if (app.activeYoutubeInterval) {
                clearInterval(app.activeYoutubeInterval);
            }
            app.activeYoutubePlayer = null;
            app.activeYoutubeInterval = null;

            modal.classList.add('hidden');
            modal.innerHTML = '';
        },
        toggleUploadMethod: (method) => {
            const urlForm = document.getElementById('method-url');
            const fileForm = document.getElementById('method-file');
            const btns = document.querySelectorAll('.upload-tab-btn');

            btns.forEach(b => b.classList.remove('active'));

            if (method === 'url') {
                urlForm.classList.remove('hidden');
                fileForm.classList.add('hidden');
                btns[0].classList.add('active'); // First btn is URL
                btns[1].classList.remove('active');
                // Restore required attributes for URL inputs (Title & Video URL only)
                urlForm.querySelectorAll('input[name^="ep_title_"], input[name^="ep_url_"]').forEach(i => i.setAttribute('required', ''));
            } else {
                urlForm.classList.add('hidden');
                fileForm.classList.remove('hidden');
                btns[0].classList.remove('active');
                btns[1].classList.add('active'); // Second btn is File
                // Remove required attributes from URL inputs so form can submit
                const urlSection = document.getElementById('method-url');
                if (urlSection) urlSection.querySelectorAll('input').forEach(i => i.removeAttribute('required'));
            }
        },

        onVideoError: (videoEl) => {
            console.warn("Direct video playback failed. Switching to fallback iframe.");
            const container = videoEl.parentElement; // .video-player-container
            const fallbackUrl = videoEl.dataset.fallback;

            if (fallbackUrl && container) {
                // Ensure preview format
                const iframeUrl = fallbackUrl.replace('/view', '/preview');
                container.innerHTML = `
                                                                            <button class="close-player" onclick="app.handlers.closePlayer()"
                                                                                style="position: absolute; top: 20px; right: 20px; z-index: 200; background: none; border: none; color: white; cursor: pointer;">
                                                                                <i data-lucide="x" width="40" height="40"></i>
                                                                            </button>
                                                                            <iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                                                                            `;
                if (window.lucide) window.lucide.createIcons();
            }
        },

        handleFileSelect: (input) => {
            const display = document.getElementById('file-name-display');
            if (input.files && input.files[0]) {
                display.textContent = "Selected: " + input.files[0].name;
                display.style.display = 'block';
            } else {
                display.style.display = 'none';
            }
        }
    },

    pages: {
        home: (container) => {
            // Clear existing content
            container.innerHTML = '';

            // Hero Section - PRIORITIZE CUSTOM CONTENT
            // Use the first custom item if available, otherwise fallback to TMDB or Mock
            const heroItem = app.state.customContent.length > 0 ? app.state.customContent[0] : (app.state.tmdbContent.trending[0] || app.services.getMockHero());

            let heroImg = 'https://via.placeholder.com/1920x1080?text=No+Hero+Image';

            // Prioritize backdrop
            if (heroItem.backdrop_path) {
                if (heroItem.backdrop_path.startsWith('http')) {
                    heroImg = heroItem.backdrop_path;
                } else {
                    heroImg = app.state.config.backdropBaseUrl + heroItem.backdrop_path;
                }
            } else if (heroItem.poster_path) {
                if (heroItem.poster_path.startsWith('http')) {
                    heroImg = heroItem.poster_path;
                } else {
                    heroImg = app.state.config.backdropBaseUrl + heroItem.poster_path;
                }
            }

            const hero = document.createElement('div');
            hero.className = 'hero';
            hero.style.backgroundImage = `url('${heroImg}')`;
            hero.style.cursor = 'pointer'; // Make it look clickable

            // Expose hero item globally for button click (legacy)
            window.currentHeroItem = heroItem;

            // Disable full slide click, enable interactive buttons
            // hero.onclick = ... (removed)
            hero.style.cursor = 'default';

            hero.innerHTML = `
                <div class="hero-overlay" style="background: linear-gradient(to top, #141414 10%, transparent 90%);"></div>
                <!-- Left Content -->
                <div class="hero-content" style="max-width: 600px; padding-bottom: 100px;">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="color: #E50914; font-weight: 800; font-size: 2.5rem; margin-right: 2px;">T</span>
                        <span style="color: #ddd; font-weight: 500; letter-spacing: 5px; font-size: 0.9rem; margin-top: 5px;">SERIES</span>
                    </div>
                    
                    <h1 class="hero-title" style="font-size: 4rem; line-height: 1.0; margin-bottom: 20px; text-transform: uppercase;">
                        ${heroItem.title || heroItem.name}
                    </h1>
                    
                    <p class="hero-desc" style="font-size: 1.4rem; font-weight: 500; font-style: italic; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); margin-bottom: 30px; line-height: 1.2;">
                        ${(heroItem.overview || heroItem.description || '').substring(0, 100)}...
                    </p>
                    
                    <div class="hero-buttons" style="display: flex; gap: 15px;">
                        <button class="btn" onclick="app.handlers.playHero()"
                            style="background: white; color: black; border: none; padding: 10px 25px; font-size: 1.1rem; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <i data-lucide="play" fill="black"></i> Play
                        </button>
                        <button class="btn" onclick="app.router.openDetails(window.currentHeroItem)"
                            style="background: rgba(109, 109, 110, 0.7); color: white; border: none; padding: 10px 25px; font-size: 1.1rem; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <i data-lucide="info"></i> More Info
                        </button>
                    </div>
                </div>

                <!-- Right Bottom Icons -->
                <div style="position: absolute; right: 0; bottom: 30%; display: flex; align-items: center; gap: 10px;">
                    <button style="background: transparent; border: 1px solid rgba(255,255,255,0.5); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3);">
                        <i data-lucide="volume-x"></i>
                    </button>
                    <div style="background: rgba(51, 51, 51, 0.6); border-left: 3px solid #dcdcdc; padding: 5px 15px 5px 10px; color: white; font-weight: bold; font-size: 1.1rem;">
                        16+
                    </div>
                </div>
            `;
            container.appendChild(hero);
            lucide.createIcons();

            // API Config Prompt if empty
            if (!app.state.config.apiKey) {
                const notice = document.createElement('div');
                notice.style.padding = '20px 4%';
                notice.style.background = '#ffa00a20';
                notice.style.borderLeft = '4px solid #ffa00a';
                notice.innerHTML = `<p><strong>Pro Tip:</strong> To see real movies, add your TMDB API Key in <a href="#settings" style="color:white; text-decoration:underline;">Settings</a>. Currently showing Sample Data.</p>`;
                container.appendChild(notice);
            }

            // Rows
            if (app.state.customContent.length > 0) {
                app.components.createRow(container, 'Top Searches', app.state.customContent);
            }
            app.components.createRow(container, 'Top Searches', app.state.tmdbContent.trending);
            app.components.createRow(container, 'Your Next Watch', app.state.tmdbContent.topRated);
            app.components.createRow(container, 'Retro TV', app.state.tmdbContent.action);
            app.components.createRow(container, 'Nostalgic \'90s', app.state.tmdbContent.comedy);
        },

        custom: (container) => {
            container.innerHTML = `
                <div style="padding: 100px 4% 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h1>My Custom Content</h1>
                        <button class="btn btn-primary" onclick="window.location.hash = 'add'"><i data-lucide="plus"></i> Add Title</button>
                    </div>
                    <div class="grid-layout">
                        ${app.state.customContent.map(item => `
                            <div class="poster" onclick="app.handlers.openDetailsById('${item.id}')">
                                <img src="${item.poster_path}" class="poster-img" style="aspect-ratio: 2/3;">
                                <h3 style="margin-top: 10px; font-size: 1rem;">${item.title}</h3>
                            </div>
                        `).join('')}
                    </div>
                    ${app.state.customContent.length === 0 ? '<p>No content yet. Go add some!</p>' : ''}
                </div>
            `;
            lucide.createIcons();
        },

        addContent: (container, editId = null) => {
            let editItem = null;
            if (editId) {
                editItem = app.state.customContent.find(i => i.id == editId);
            }

            container.innerHTML = `
                                                                        <div class="add-content-container">
                                                                            <h1>${editItem ? 'Edit' : 'Add'} Custom Title</h1>
                                                                            <form id="add-content-form" class="netflix-form">
                                                                                <div class="form-grid">
                                                                                    <input type="text" name="title" placeholder="Title" value="${editItem ? editItem.title : ''}" required>
                                                                                        <input type="text" name="genre" placeholder="Genre" value="${editItem ? (editItem.genre || '') : ''}">
                                                                                        </div>
                                                                                        <textarea name="description" placeholder="Description" required>${editItem ? (editItem.description || editItem.overview || '') : ''}</textarea>

                                                                                        <div class="form-grid">
                                                                                            <input type="url" name="poster_path" placeholder="Poster Image URL" value="${editItem ? editItem.poster_path : ''}" required>
                                                                                                <input type="url" name="backdrop_path" placeholder="Backdrop Image URL" value="${editItem ? editItem.backdrop_path : ''}" required>
                                                                                                </div>

                                                                                                <div class="media-section">
                                                                                                    <h3>Media Content</h3>
                                                                                                    <p>Choose how you want to add your video.</p>

                                                                                                    <div class="upload-tabs">
                                                                                                        <button type="button" class="upload-tab-btn active" onclick="app.handlers.toggleUploadMethod('url')">Link URL</button>
                                                                                                        <button type="button" class="upload-tab-btn" onclick="app.handlers.toggleUploadMethod('file')">Upload File</button>
                                                                                                    </div>

                                                                                                    <div id="method-url">
                                                                                                        <style>
                                                                                                            .season-selector-container {
                                                                                                                margin - bottom: 20px;
                                                                                                            border-bottom: 1px solid #333;
                                                                                                            padding-bottom: 10px;
                                    }
                                                                                                            .season-list {
                                                                                                                display: flex;
                                                                                                            flex-direction: column;
                                                                                                            gap: 5px;
                                                                                                            max-height: 200px;
                                                                                                            overflow-y: auto;
                                                                                                            background: #222;
                                                                                                            padding: 10px;
                                                                                                            border-radius: 4px;
                                    }
                                                                                                            .season-btn {
                                                                                                                text - align: left;
                                                                                                            background: none;
                                                                                                            border: none;
                                                                                                            color: #aaa;
                                                                                                            padding: 8px 12px;
                                                                                                            cursor: pointer;
                                                                                                            font-size: 0.9rem;
                                                                                                            border-left: 3px solid transparent;
                                                                                                            transition: all 0.2s;
                                    }
                                                                                                            .season-btn:hover {background: #333; color: white; }
                                                                                                            .season-btn.active {
                                                                                                                color: white;
                                                                                                            font-weight: bold;
                                                                                                            border-left-color: #E50914; /* Netflix Red */
                                                                                                            background: #333;
                                    }
                                                                                                            .add-season-btn {
                                                                                                                margin - top: 10px;
                                                                                                            font-size: 0.8rem;
                                                                                                            color: #46d369;
                                                                                                            cursor: pointer;
                                                                                                            background: none;
                                                                                                            border: none;
                                                                                                            display: flex; align-items: center; gap: 5px;
                                    }
                                                                                                        </style>

                                                                                                        <div class="season-selector-container">
                                                                                                            <h4 style="margin-bottom: 10px;">Select Season to Edit</h4>
                                                                                                            <div style="display: flex; gap: 20px;">
                                                                                                                <div class="season-list" id="edit-season-list" style="width: 150px; flex-shrink: 0;">
                                                                                                                    <!-- Season Buttons Injected Here -->
                                                                                                                </div>
                                                                                                                <div style="flex-grow: 1;">
                                                                                                                    <div id="episodes-container">
                                                                                                                        <!-- Episodes Injected Here -->
                                                                                                                    </div>
                                                                                                                    <button type="button" class="btn btn-secondary full-width" onclick="app.handlers.addEpisodeField()">
                                                                                                                        <i data-lucide="plus-circle"></i> Add Episode to Current Season
                                                                                                                    </button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                            <button type="button" class="add-season-btn" onclick="app.handlers.addNewSeason()">
                                                                                                                <i data-lucide="plus"></i> Add New Season
                                                                                                            </button>
                                                                                                        </div>

                                                                                                        <p style="font-size: 0.8rem; color: #aaa; margin-top: 15px; border-top: 1px solid #333; padding-top: 10px;">
                                                                                                            <strong>Troubleshooting:</strong> Google Drive links: Ensure H.264 (MP4).
                                                                                                        </p>
                                                                                                    </div>

                                                                                                    <div id="method-file" class="hidden">
                                                                                                        <div id="file-episodes-container">
                                                                                                            <!-- File upload groups -->
                                                                                                        </div>
                                                                                                        <button type="button" class="btn btn-secondary full-width" onclick="app.handlers.addFileUploadField()">
                                                                                                            <i data-lucide="plus-circle"></i> Add Another Episode
                                                                                                        </button>
                                                                                                        <p style="font-size: 0.8rem; color: #777; margin-top: 10px;">Note: Files are saved locally. Use "Export Library" in Settings to publish.</p>
                                                                                                    </div>
                                                                                                </div>

                                                                                                <button type="submit" class="btn btn-primary submit-btn">${editItem ? 'Save Changes' : 'Save to Library'}</button>
                                                                                            </form>
                                                                                        </div>
                                                                                        `;
            lucide.createIcons();

            // Pre-fill Episodes
            const episodesContainer = document.getElementById('episodes-container');
            const fileEpisodesContainer = document.getElementById('file-episodes-container');

            episodesContainer.innerHTML = '';
            fileEpisodesContainer.innerHTML = '';

            if (editItem && editItem.episodes && editItem.episodes.length > 0) {
                // Assume if the first episode has a blob URL, it's a file upload item (simple heuristic)
                // But since we can edit either way, let's pre-fill the one matching the current mode? 
                // Actually, let's pre-fill both or just default to URL. 
                // It's tricky because we don't store "is_file_mode". 
                // Let's populate the active tab's logic based on data.
                // Populating URL fields
                editItem.episodes.forEach(ep => app.handlers.addEpisodeField(ep));
                // Populating File fields (titles/desc mainly)
                editItem.episodes.forEach(ep => app.handlers.addFileUploadField(ep));
            } else {
                app.handlers.addEpisodeField(); // Add one empty URL
                app.handlers.addFileUploadField(); // Add one empty File
            }

            // Initialize Season Selector for Editing
            if (editItem && editItem.episodes && editItem.episodes.length > 0) {
                const uniqueSeasons = [...new Set(editItem.episodes.map(e => e.season || 1))].sort((a, b) => a - b);
                if (uniqueSeasons.length > 0) app.handlers.editingSeasons = uniqueSeasons;
                else app.handlers.editingSeasons = [1];

                // Render selector after DOM update
                setTimeout(() => {
                    app.handlers.renderSeasonSelector();
                    app.handlers.switchEditSeason(app.handlers.editingSeasons[0]);
                }, 50);

            } else {
                app.handlers.editingSeasons = [1];
                app.handlers.renderSeasonSelector();
                setTimeout(() => app.handlers.switchEditSeason(1), 50);
            }

            // Handle Submit
            document.getElementById('add-content-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalBtnText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving... (Please Wait)';

                const fd = new FormData(e.target);

                // Determine Mode
                const isFileMode = document.getElementById('method-url') && document.getElementById('method-url').classList.contains('hidden');

                let episodes = [];

                if (isFileMode) {
                    // File Upload Mode - Multiple Episodes
                    const groups = document.querySelectorAll('.file-episode-group');

                    // Use standard for loop for async/await support
                    for (let idx = 0; idx < groups.length; idx++) {
                        const grp = groups[idx];
                        try {
                            const title = grp.querySelector('.file-title-input')?.value || `Episode ${idx + 1}`;
                            const desc = grp.querySelector('.file-desc-input')?.value || '';
                            const runtime = grp.querySelector('.file-runtime-input')?.value || '';
                            const season = grp.querySelector('.file-season-input')?.value || 1;

                            const fileInput = grp.querySelector('.video-file-input');
                            const capInput = grp.querySelector('.caption-file-input');


                            const textVidInput = grp.querySelector('.video-url-input');
                            const textCapInput = grp.querySelector('.caption-url-input');

                            // Check for delete flags
                            const clearVid = grp.querySelector('.clear-video-cb')?.checked || false;
                            const clearCap = grp.querySelector('.clear-caption-cb')?.checked || false;

                            // Retrieve Original URLs safely
                            const originalVid = grp.querySelector('.original-video-url')?.value || '';
                            const originalCap = grp.querySelector('.original-caption-url')?.value || '';

                            // Video Logic
                            let vidUrl = null;
                            if (fileInput && fileInput.files.length > 0) {
                                // New File Upload
                                const file = fileInput.files[0];
                                const fileId = 'vid_' + Date.now() + '_' + idx;
                                try {
                                    await app.storage.saveFile(fileId, file);
                                    vidUrl = 'idb://' + fileId;
                                } catch (err) {
                                    console.error('Error saving video to DB:', err);
                                    alert('Error saving video file. Check console.');
                                    return;
                                }
                            } else if (textVidInput && textVidInput.value.trim()) {
                                vidUrl = textVidInput.value.trim();
                            } else if (originalVid && !clearVid) {
                                // Preserve existing
                                vidUrl = originalVid;
                            }

                            // Caption Logic
                            let capUrl = null;
                            if (capInput && capInput.files.length > 0) {
                                // New File Upload
                                const file = capInput.files[0];
                                const capId = 'cap_' + Date.now() + '_' + idx;
                                try {
                                    await app.storage.saveFile(capId, file);
                                    capUrl = 'idb://' + capId;
                                } catch (err) { console.error('Error saving caption:', err); }
                            } else if (textCapInput && textCapInput.value.trim()) {
                                capUrl = textCapInput.value.trim();
                            } else if (originalCap && !clearCap) {
                                // Preserve existing
                                capUrl = originalCap;
                            }

                            // Handle deletions from DB
                            if (clearVid && originalVid && originalVid.startsWith('idb://')) {
                                app.storage.deleteFile(originalVid.replace('idb://', ''));
                            }
                            if (clearCap && originalCap && originalCap.startsWith('idb://')) {
                                app.storage.deleteFile(originalCap.replace('idb://', ''));
                            }

                            if (vidUrl) {
                                episodes.push({
                                    title: title,
                                    overview: desc,
                                    runtime: runtime,
                                    season: parseInt(season) || 1,
                                    video_url: vidUrl,
                                    caption_url: capUrl
                                });
                            }
                        } catch (loopErr) {
                            console.error("Error processing episode group " + idx, loopErr);
                        }
                    }

                    if (episodes.length === 0) {
                        alert("Please provide at least one video file.");
                        return;
                    }
                } else {
                    // URL Mode logic - Updated for Season Selector
                    const container = document.getElementById('episodes-container');
                    const groups = container.querySelectorAll('.episode-input-group');

                    groups.forEach((grp, index) => {
                        const titleInput = grp.querySelector('input[name^="ep_title_"]');
                        const descInput = grp.querySelector('textarea[name^="ep_desc_"]');
                        const urlInput = grp.querySelector('input[name^="ep_url_"]');
                        const capInput = grp.querySelector('input[name^="ep_cap_"]');
                        const seasonInput = grp.querySelector('input[name^="ep_season_"]');

                        if (titleInput && titleInput.value && urlInput && urlInput.value) {
                            episodes.push({
                                title: titleInput.value,
                                overview: descInput ? descInput.value : '',
                                video_url: urlInput ? urlInput.value : '',
                                caption_url: capInput ? capInput.value : '',
                                season: seasonInput ? parseInt(seasonInput.value) : 1
                            });
                        }
                    });
                }

                if (episodes.length === 0) {
                    alert("Please add at least one episode/video.");
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
                    return;
                }

                const newItem = {
                    id: editItem ? editItem.id : Date.now(),
                    title: fd.get('title'),
                    description: fd.get('description'),
                    genre: fd.get('genre'),
                    poster_path: fd.get('poster_path'),
                    backdrop_path: fd.get('backdrop_path'),
                    is_custom: true,
                    episodes: episodes,
                    video_url: episodes[0]?.video_url
                };

                if (editItem) {
                    const idx = app.state.customContent.findIndex(i => i.id == editItem.id);
                    if (idx !== -1) app.state.customContent[idx] = newItem;
                } else {
                    app.state.customContent.push(newItem);
                }

                localStorage.setItem('netflix_custom_content', JSON.stringify(app.state.customContent));
                alert('Saved!');
                window.location.hash = 'custom';
            });
        },

        settings: (container) => {
            container.innerHTML = `
                <div style="padding: 100px 4% 20px; max-width: 600px; margin: 0 auto;">
                    <h1>Settings</h1>
                    <div style="background: #181818; padding: 30px; border-radius: 8px; margin-top: 20px;">
                        <h3 style="margin-bottom: 20px;">Publishing</h3>
                        <p style="margin-bottom: 15px; color: #aaa;">Want to share your library with others? Export your content below and add it to the codebase.</p>
                        <button class="btn btn-primary full-width" onclick="app.handlers.exportLibrary()">Export Library Code</button>
                    </div>

                    <div style="background: #181818; padding: 30px; border-radius: 8px; margin-top: 20px;">
                        <h3 style="margin-bottom: 20px;">TMDB Configuration</h3>
                        <p style="margin-bottom: 15px; color: #aaa;">Enter your API Key to fetch real movie data from The Movie Database.</p>
                        <input type="text" id="tmdb-key" value="${app.state.config.apiKey}" placeholder="Enter TMDB API Key" style="margin-bottom: 15px;">
                        <button class="btn btn-primary" onclick="app.services.saveSettings()">Save Configuration</button>
                        
                        <div style="margin-top: 30px; border-top: 1px solid #333; padding-top: 20px;">
                            <button class="btn btn-secondary" style="background: #cc0000;" onclick="localStorage.clear(); location.reload();">Clear All Data (Reset)</button>
                        </div>
                    </div>
                </div>
             `;
        },

        search: (container, query) => {
            // Mock related titles for visual match
            const related = [
                `${query} & Order`, `${query}less`, `${query} Abiding Citizen`,
                `${query} & Order: SVU`, `The ${query}yer`, `${query}s of Attraction`
            ];

            // Filter content (Basic local search for demo)
            // Combine all available content
            const allContent = [
                ...app.state.tmdbContent.trending,
                ...app.state.tmdbContent.topRated,
                ...app.state.tmdbContent.action,
                ...app.state.customContent
            ];

            // Allow duplicates for visual fullness if array is small
            let results = allContent;
            // If we had real search, we'd filter: results = allContent.filter(i => i.title.toLowerCase().includes(query.toLowerCase()));

            // For the visual "WOW" factor request, let's just show a grid of cool stuff
            if (results.length < 10) results = [...results, ...results];

            container.innerHTML = `
                                                                                        <div class="search-results-container">
                                                                                            <div class="related-titles-bar">
                                                                                                <span style="color: #777;">Explore titles related to:</span>
                                                                                                ${related.map(t => `<span class="related-title">${t}</span>`).join('')}
                                                                                            </div>

                                                                                            <div class="grid-layout">
                                                                                                ${results.map(item => {
                const imgPath = item.backdrop_path || item.poster_path;
                let fullImg = 'https://via.placeholder.com/300x169';
                if (imgPath) {
                    fullImg = imgPath.startsWith('http') ? imgPath : 'https://image.tmdb.org/t/p/w780' + imgPath;
                }

                return `
                            <div class="poster" onclick='app.router.openDetails(${JSON.stringify(item).replace(/'/g, "&#39;")})'>
                                <img src="${fullImg}" class="poster-img">
                                <h3 style="margin-top: 10px; font-size: 0.9rem; color: #ccc;">${item.title || item.name}</h3>
                            </div>
                            `;
            }).join('')}
                                                                                            </div>
                                                                                        </div>
                                                                                        `;
            lucide.createIcons();
        },

        tv: (container) => {
            const customShows = app.state.customContent;
            const tmdb = app.state.tmdbContent;

            // No Hero, just nice clean lists
            let html = `
                                                                                        <div class="content-rows" style="padding-top: 200px; padding-bottom: 50px; position: relative; z-index: 10;">
                                                                                            `;

            // Custom Content Row First if exists
            if (customShows && customShows.length > 0) {
                html += `<div class="row-container" id="row-custom-tv" style="margin-bottom: 50px;"></div>`;
            }

            html += `
                                                                                            <div class="row-container" id="row-popular"></div>
                                                                                        </div>
                                                                                        `;
            container.innerHTML = html;
            lucide.createIcons();

            // Render Rows
            if (customShows && customShows.length > 0) {
                app.components.createRow(document.getElementById('row-custom-tv'), "My Custom Uploads", customShows);
                // Fix negative margin issue from global CSS
                const customRow = document.getElementById('row-custom-tv').querySelector('.row');
                if (customRow) customRow.style.marginTop = '0';
            }
            app.components.createRow(document.getElementById('row-popular'), "Popular on Netflix", tmdb.trending);

            // Fix negative margin issue for Popular row as well
            const popRow = document.getElementById('row-popular').querySelector('.row');
            if (popRow) {
                popRow.style.marginTop = '0';
                // Add the requested spacing from "My Custom Uploads"
                popRow.style.marginTop = '50px';
            }
        },
        movies: (c) => { c.innerHTML = '<div style="padding: 100px 4%; text-align: center;"><h1>Movies</h1><p>Coming Soon</p></div>'; }
    },

    components: {
        hero: (item) => {
            let heroImg = 'https://via.placeholder.com/1920x1080?text=No+Hero+Image';
            if (item.backdrop_path) {
                if (item.backdrop_path.startsWith('http')) {
                    heroImg = item.backdrop_path;
                } else {
                    heroImg = 'https://image.tmdb.org/t/p/original' + item.backdrop_path;
                }
            } else if (item.poster_path) {
                if (item.poster_path.startsWith('http')) {
                    heroImg = item.poster_path;
                } else {
                    heroImg = 'https://image.tmdb.org/t/p/original' + item.poster_path;
                }
            }

            return `
                                                                                        <div class="hero" style="background-image: url('${heroImg}')">
                                                                                            <div class="hero-overlay"></div>
                                                                                            <div class="hero-content">
                                                                                                <h1 class="hero-title">${item.title || item.name}</h1>
                                                                                                <p class="hero-desc">${(item.overview || item.description || '').substring(0, 150)}...</p>
                                                                                                <div class="hero-buttons">
                                                                                                    <button class="btn btn-primary" onclick="app.router.openPlayer('${item.video_url || ''}', '${item.caption_url || ''}')"><i data-lucide="play"></i> Play</button>
                                                                                                    <button class="btn btn-secondary" onclick='app.router.openDetails(${JSON.stringify(item).replace(/' /g, "&#39;")})'><i data-lucide="info"></i> More Info</button>
                                                                                            </div>
                                                                                        </div>
                                                                                </div>
                                                                                `;
        },

        createRow: (container, title, items) => {
            if (!items || items.length === 0) return;
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = `
                <h2 class="row-title">${title}</h2>
                <div class="row-posters"></div>
            `;
            const posters = row.querySelector('.row-posters');

            posters.innerHTML = items.map(item => {
                let imgPath = 'https://via.placeholder.com/300x169?text=No+Image';
                if (item.is_custom && item.backdrop_path) {
                    imgPath = item.backdrop_path;
                } else if (item.backdrop_path) {
                    imgPath = item.backdrop_path.startsWith('http') ? item.backdrop_path : `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
                } else if (item.poster_path) {
                    imgPath = item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                }

                const isTop10 = Math.random() > 0.8;
                const isNewSeason = Math.random() > 0.8;
                const isOriginal = Math.random() > 0.7;

                return `
                    <div class="poster" onclick="app.handlers.openDetailsById('${item.id}')">
                        <img src="${imgPath}" alt="${item.title || item.name}" class="poster-img">
                        ${isOriginal ? '<div class="netflix-original-logo">N</div>' : ''}
                        ${isTop10 ? '<div class="top-10-badge">TOP<br>10</div>' : ''}
                        ${isNewSeason ? '<div class="card-badge">New Season</div>' : ''}
                    </div>
                `;
            }).join('');

            container.appendChild(row);
        },


        renderEpisodeList: (item, season = 1) => {
            if (!item.episodes) return '';
            const filtered = item.episodes.filter(ep => (ep.season || 1) == season);
            if (filtered.length === 0) return '<div style="padding:20px; text-align:center; color:#777;">No episodes available for this season.</div>';

            return filtered.map((ep, filteredIndex) => {
                const index = item.episodes.indexOf(ep);
                const isCustom = item.is_custom;
                // Inherited or simple logic for thumbnail
                let imgUrl;
                // 1. Explicit Episode Image
                if (ep.still_path || ep.img) {
                    imgUrl = ep.still_path || ep.img;
                    if (imgUrl.startsWith('/')) imgUrl = (app.state.config.backdropBaseUrl || 'https://image.tmdb.org/t/p/original') + imgUrl;
                }
                // 2. Google Drive Auto-Thumbnail (Extract ID)
                else if (ep.video_url && ep.video_url.includes('drive.google.com')) {
                    const match = ep.video_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        imgUrl = `https://lh3.googleusercontent.com/d/${match[1]}=w500`;
                    }
                }

                // 3. Fallback to Show Backdrop
                if (!imgUrl) {
                    imgUrl = isCustom ? item.backdrop_path : (item.backdrop_path ? app.state.config.backdropBaseUrl + item.backdrop_path : 'https://via.placeholder.com/200');
                }
                const epId = 'ep-dur-' + item.id + '-' + index;

                return `
                                                                                <div class="episode-item" onclick="app.router.openPlayer('${ep.video_url || ''}', '${ep.caption_url || ''}', '${item.id || ''}', ${index})">
                                                                                    <div class="episode-number">${filteredIndex + 1}</div>
                                                                                    <div class="episode-thumbnail" style="background-image: url('${imgUrl}'); background-size: cover; background-position: center;"></div>
                                                                                    <div class="episode-info">
                                                                                        <div style="display:flex; justify-content:space-between; width:100%;">
                                                                                            <div class="episode-title">${ep.title || 'Episode ' + (index + 1)}</div>
                                                                                            <div id="${epId}" style="font-size: 0.9rem; color: #777;">${ep.runtime ? ep.runtime + 'm' : '--m'}</div>
                                                                                        </div>
                                                                                        <div class="episode-desc">${ep.overview || 'No description available for this episode.'}</div>
                                                                                    </div>
                                                                                </div>
                                                                                `;
            }).join('');
        }
    },

    services: {
        findItemById: (id) => {
            // Check custom content first
            let item = app.state.customContent.find(i => i.id == id);
            if (item) return item;

            // Check all TMDB lists
            const lists = [app.state.tmdbContent.trending, app.state.tmdbContent.topRated, app.state.tmdbContent.action, app.state.tmdbContent.comedy];
            for (const list of lists) {
                item = list.find(i => i.id == id);
                if (item) return item;
            }
            return null;
        },
        saveSettings: () => {
            const key = document.getElementById('tmdb-key').value.trim();
            localStorage.setItem('netflix_tmdb_key', key);
            app.state.config.apiKey = key;
            alert('Settings Saved. Reloading...');
            location.reload();
        },

        getMockHero: () => {
            return {
                title: "Stranger Things",
                overview: "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.",
                backdrop_path: "/56v2KjBlU4XaOv9rVYkJu64HIIV.jpg", // Valid TMDB Path
                video_url: "https://www.youtube.com/embed/b9EkMc79ZSU",
                is_custom: false
            };
        },

        loadContent: async () => {
            const { apiKey, tmdbBaseUrl } = app.state.config;

            if (!apiKey) {
                console.warn("No API Key. Using Mock Data.");
                app.services.useMockData();
                return;
            }

            try {
                const fetcher = async (path) => {
                    let url = `${tmdbBaseUrl}${path}?language=en-US`;
                    let options = {};

                    if (apiKey.startsWith('ey')) {
                        options = {
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json;charset=utf-8'
                            }
                        };
                    } else {
                        url += `&api_key=${apiKey}`;
                    }

                    const res = await fetch(url, options);
                    const data = await res.json();
                    return data.results || [];
                };

                const [trending, topRated, action] = await Promise.all([
                    fetcher('/trending/all/week'),
                    fetcher('/movie/top_rated'),
                    fetcher('/discover/movie?with_genres=28')
                ]);

                app.state.tmdbContent.trending = trending;
                app.state.tmdbContent.topRated = topRated;
                app.state.tmdbContent.action = action;
            } catch (err) {
                console.error("API Fetch Failed", err);
                app.services.useMockData();
            }
        },

        useMockData: () => {
            // Using Real TMDB Paths for "Mock" data
            const mockData = [
                {
                    id: 1,
                    title: "Stranger Things",
                    poster_path: "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
                    backdrop_path: "/56v2KjBlU4XaOv9rVYkJu64HIIV.jpg",
                    overview: "When a young boy vanishes, a small town uncovers a mystery involving secret experiments."
                },
                {
                    id: 2,
                    title: "The Witcher",
                    poster_path: "/7vjaCdMw15FEbXyLQTVa04URsPm.jpg",
                    backdrop_path: "/jBJWaqoSCiARWtfV0GlqHrcdidd.jpg",
                    overview: "Geralt of Rivia, a mutated monster-hunter for hire, journeys toward his destiny."
                },
                {
                    id: 3,
                    title: "Inception",
                    poster_path: "/9gk7admal4ZLVD9qrhfCiUPlZk.jpg",
                    backdrop_path: "/s3TBrRGB1jav7y4argmCmkxycEZ.jpg",
                    overview: "Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious."
                },
                {
                    id: 4,
                    title: "Wednesday",
                    poster_path: "/9MA21azfI36Un8aV06v5v39f9.jpg",
                    backdrop_path: "/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
                    overview: "Wednesday Addams is expelled from her school and sent to Nevermore Academy."
                },
                {
                    id: 5,
                    title: "Squid Game",
                    poster_path: "/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg",
                    backdrop_path: "/oaGvjB0DvdhXhOKsDbDaAcJwCeR.jpg",
                    overview: "Hundreds of cash-strapped players accept a strange invitation to compete in children's games."
                },
                {
                    id: 6,
                    title: "Breaking Bad",
                    poster_path: "/ggFHVNu6YYI5L9pRwOAyJoXGLP.jpg",
                    backdrop_path: "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
                    overview: "A high school chemistry teacher turned meth producer."
                }
            ];
            app.state.tmdbContent.trending = mockData;
            app.state.tmdbContent.topRated = [...mockData].reverse();
            app.state.tmdbContent.action = mockData;
        },

        populateDurations: (item, season) => {
            const episodes = item.episodes.filter(ep => (ep.season || 1) == season);
            episodes.forEach((ep) => {
                const index = item.episodes.indexOf(ep);
                const epId = 'ep-dur-' + item.id + '-' + index;

                if (!ep.runtime) {
                    setTimeout(() => {
                        const vid = document.createElement('video');
                        vid.preload = 'metadata';
                        if (ep.video_url.startsWith('idb://')) {
                            app.storage.getFile(ep.video_url.replace('idb://', '')).then(blob => {
                                if (blob) vid.src = URL.createObjectURL(blob);
                            });
                        } else if (ep.video_url.startsWith('http') || ep.video_url.startsWith('blob')) {
                            vid.src = ep.video_url;
                        }

                        vid.onloadedmetadata = () => {
                            const el = document.getElementById(epId);
                            if (el && vid.duration && isFinite(vid.duration)) {
                                el.textContent = Math.round(vid.duration / 60) + 'm';
                            }
                        };
                    }, 100);
                }
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
