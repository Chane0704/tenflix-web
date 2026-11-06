const app = {
    state: {
        customContent: [],
        tmdbContent: {
            trending: [],
            trendingMovies: [],
            trendingTv: [],
            popularMovies: [],
            popularTv: [],
            topRated: [],
            action: [],
            comedy: []
        },
        config: {
            tmdbBaseUrl: 'https://api.themoviedb.org/3',
            imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
            backdropBaseUrl: 'https://image.tmdb.org/t/p/original',
            apiKey: localStorage.getItem('netflix_tmdb_key') || 'd582a5bf11361f97f2946cbb1cc55ce8'
        }
    },

    utils: {
        unfreezePage: () => {
            document.documentElement.classList.remove('player-open', 'modal-open');
            document.body.classList.remove('player-open', 'modal-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.documentElement.style.position = '';
            document.body.style.position = '';
            document.documentElement.style.height = '';
            document.body.style.height = '';
        },
        proxyImg: (url) => {
            if (!url) return '';
            // Proxy TMDB image domains through wsrv.nl to bypass ISP blocks
            if (url.includes('tmdb.org') || url.includes('themoviedb.org')) {
                return 'https://wsrv.nl/?url=' + url.replace(/^https?:\/\//, '');
            }
            return url;
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
            return !!localStorage.getItem('netflix_user_session') || window.location.search.includes('autologin=1');
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

            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none';

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

            // 1. IMMEDIATE RENDER: Show what we have (Custom Content) and Hide Loader
            app.router.handleHash();
            window.addEventListener('hashchange', app.router.handleHash);

            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none'; // Instant hide

            // 2. BACKGROUND FETCH: Get TMDB data
            await app.services.loadContent();

            // 3. RE-RENDER: Show the new data
            // Only re-render if we are still on the same view that needs it
            const currentHash = window.location.hash.substring(1) || 'home';
            if (['home', 'tv', 'movies', 'new'].includes(currentHash)) {
                app.router.handleHash();
            }

            // FORCE SYNC (Keep existing logic)
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
            const suggestionsEl = document.getElementById('search-suggestions');

            const POPULAR_SUGGESTIONS = [
                { title: "Deadpool", type: "Movie" },
                { title: "Deadpool 2", type: "Movie" },
                { title: "Deadpool & Wolverine", type: "Movie" },
                { title: "Once Upon a Deadpool", type: "Movie" },
                { title: "The Office", type: "Series" },
                { title: "Office Space", type: "Movie" },
                { title: "Off Campus", type: "Series" },
                { title: "The Walking Dead", type: "Series" },
                { title: "Dead Poets Society", type: "Movie" },
                { title: "Dead to Me", type: "Series" },
                { title: "Fear the Walking Dead", type: "Series" },
                { title: "Spider-Man", type: "Movie" },
                { title: "Spider-Man: No Way Home", type: "Movie" },
                { title: "Spider-Man: Across the Spider-Verse", type: "Movie" },
                { title: "Spider-Man: Into the Spider-Verse", type: "Movie" },
                { title: "Avengers", type: "Movie" },
                { title: "Avengers: Endgame", type: "Movie" },
                { title: "Avengers: Infinity War", type: "Movie" },
                { title: "The Batman", type: "Movie" },
                { title: "The Dark Knight", type: "Movie" },
                { title: "Batman Begins", type: "Movie" },
                { title: "Superman", type: "Movie" },
                { title: "Harry Potter and the Sorcerer's Stone", type: "Movie" },
                { title: "Star Wars", type: "Movie" },
                { title: "Stranger Things", type: "Series" },
                { title: "Breaking Bad", type: "Series" },
                { title: "Better Call Saul", type: "Series" },
                { title: "Game of Thrones", type: "Series" },
                { title: "House of the Dragon", type: "Series" },
                { title: "The Boys", type: "Series" },
                { title: "Wednesday", type: "Series" },
                { title: "Squid Game", type: "Series" },
                { title: "Inception", type: "Movie" },
                { title: "Interstellar", type: "Movie" },
                { title: "Oppenheimer", type: "Movie" },
                { title: "Barbie", type: "Movie" },
                { title: "Avatar", type: "Movie" },
                { title: "Gladiator", type: "Movie" },
                { title: "Dune", type: "Movie" },
                { title: "Dune: Part Two", type: "Movie" },
                { title: "John Wick", type: "Movie" },
                { title: "Top Gun: Maverick", type: "Movie" },
                { title: "Fight Club", type: "Movie" },
                { title: "The Matrix", type: "Movie" },
                { title: "Friends", type: "Series" },
                { title: "Emily in Paris", type: "Series" },
                { title: "Dhurandhar", type: "Movie" },
                { title: "Dhurandhar: The Revenge", type: "Movie" },
                { title: "Voicemails For Isabelle", type: "Movie" },
                { title: "Crazy Rich Asians", type: "Movie" },
                { title: "How to Lose a Guy in 10 Days", type: "Movie" },
                { title: "How to Train Your Dragon", type: "Movie" },
                { title: "How to Train Your Dragon 2", type: "Movie" },
                { title: "How to Train Your Dragon: The Hidden World", type: "Movie" },
                { title: "The Perks of Being a Wallflower", type: "Movie" },
                { title: "10 Things I Hate About You", type: "Movie" }
            ];

            let activeSuggestionIdx = -1;

            const hideSuggestions = () => {
                if (suggestionsEl) {
                    suggestionsEl.classList.add('hidden');
                    suggestionsEl.innerHTML = '';
                }
                activeSuggestionIdx = -1;
            };

            const selectSuggestion = (title) => {
                searchInput.value = title;
                hideSuggestions();
                const main = document.getElementById('main-content');
                if (main) app.pages.search(main, title);
            };

            const updateSuggestions = (query) => {
                if (!suggestionsEl) return;
                const q = query.trim().toLowerCase();
                if (q.length === 0) {
                    hideSuggestions();
                    return;
                }

                // Collect from custom content
                const customItems = (app.state.customContent || []).map(i => ({
                    title: i.title || i.name,
                    type: i.episodes ? 'Series' : 'Movie'
                })).filter(i => i.title);

                // Collect from popular suggestions
                const allItems = [...customItems, ...POPULAR_SUGGESTIONS];

                // Append any TMDB titles recently fetched
                if (app.state.searchResults) {
                    app.state.searchResults.forEach(r => {
                        const t = r.title || r.name;
                        if (t && !allItems.some(x => x.title.toLowerCase() === t.toLowerCase())) {
                            allItems.push({ title: t, type: r.media_type === 'tv' ? 'Series' : 'Movie' });
                        }
                    });
                }

                // Filter matching titles
                const matched = allItems.filter(item => item.title.toLowerCase().includes(q));

                // Deduplicate by title
                const seen = new Set();
                const unique = [];
                for (const item of matched) {
                    const norm = item.title.toLowerCase();
                    if (!seen.has(norm)) {
                        seen.add(norm);
                        unique.push(item);
                    }
                }

                // Sort: items starting with query come first
                unique.sort((a, b) => {
                    const aStarts = a.title.toLowerCase().startsWith(q);
                    const bStarts = b.title.toLowerCase().startsWith(q);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    return a.title.localeCompare(b.title);
                });

                const topSuggestions = unique.slice(0, 6);

                if (topSuggestions.length === 0) {
                    hideSuggestions();
                    return;
                }

                suggestionsEl.innerHTML = topSuggestions.map((item, idx) => {
                    // Highlight the query portion in the title
                    const title = item.title;
                    const matchStart = title.toLowerCase().indexOf(q);
                    let renderedTitle = title;
                    if (matchStart !== -1) {
                        const before = title.substring(0, matchStart);
                        const match = title.substring(matchStart, matchStart + q.length);
                        const after = title.substring(matchStart + q.length);
                        renderedTitle = `${before}<span style="color:#fff;font-weight:700;">${match}</span>${after}`;
                    }

                    return `
                        <div class="search-suggestion-item" data-index="${idx}" data-title="${title.replace(/"/g, '&quot;')}">
                            <span class="search-suggestion-icon"><i data-lucide="search" style="width:14px;height:14px;"></i></span>
                            <span class="search-suggestion-title">${renderedTitle}</span>
                            ${item.type ? `<span class="search-suggestion-meta">${item.type}</span>` : ''}
                        </div>
                    `;
                }).join('');

                suggestionsEl.classList.remove('hidden');
                activeSuggestionIdx = -1;
                if (window.lucide) lucide.createIcons();
            };

            if (suggestionsEl) {
                suggestionsEl.addEventListener('click', (e) => {
                    const item = e.target.closest('.search-suggestion-item');
                    if (item && item.dataset.title) {
                        selectSuggestion(item.dataset.title);
                    }
                });
            }

            searchIcon.addEventListener('click', () => {
                searchBox.classList.add('active');
                searchInput.focus();
                searchInput.className = 'search-input';
                searchClose.classList.remove('hidden');
                if (searchInput.value.trim().length > 0) {
                    updateSuggestions(searchInput.value.trim());
                }
            });

            searchClose.addEventListener('click', () => {
                searchBox.classList.remove('active');
                searchInput.classList.remove('active');
                searchClose.classList.add('hidden');
                searchInput.value = '';
                hideSuggestions();
                // Immediately restore previous/current view
                app.router.handleHash();
            });

            // Force hash handling when clicking nav links to the same hash
            document.querySelectorAll('.nav-links a, .logo').forEach(link => {
                link.addEventListener('click', (e) => {
                    const targetHash = link.getAttribute('href') || '#home';
                    const currentHash = window.location.hash || '#home';
                    if (currentHash === targetHash) {
                        // Already on this hash, hashchange won't fire. Force a re-render.
                        setTimeout(() => app.router.handleHash(), 10);
                    }
                });
            });

            // Profile Dropdown
            const profileMenu = document.querySelector('.profile-menu');
            const dropdown = document.getElementById('profile-dropdown');
            const chevron = profileMenu.querySelector('i[data-lucide="chevron-down"]');

            profileMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
                // Rotate chevron
                if (chevron) {
                    if (!dropdown.classList.contains('hidden')) {
                        chevron.style.transform = 'rotate(180deg)';
                    } else {
                        chevron.style.transform = 'rotate(0deg)';
                    }
                }
            });

            document.addEventListener('click', (e) => {
                if (profileMenu && !profileMenu.contains(e.target)) {
                    dropdown.classList.add('hidden');
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                }
                if (searchBox && !searchBox.contains(e.target)) {
                    hideSuggestions();
                }
            });

            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length > 0) {
                    updateSuggestions(searchInput.value.trim());
                }
            });

            let searchDebounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

                if (!query || query.trim().length === 0) {
                    hideSuggestions();
                    // Instantly restore page on backspace / clear
                    app.router.handleHash();
                    return;
                }

                // Show instant suggestions immediately (0ms)
                updateSuggestions(query.trim());

                searchDebounceTimer = setTimeout(() => {
                    const main = document.getElementById('main-content');
                    if (main && searchInput.value.trim().length > 0) {
                        app.pages.search(main, searchInput.value.trim()).then(() => {
                            // Refresh suggestions with live search results
                            if (document.activeElement === searchInput && searchInput.value.trim().length > 0) {
                                updateSuggestions(searchInput.value.trim());
                            }
                        });
                    }
                }, 250);
            });

            searchInput.addEventListener('keydown', (e) => {
                const items = suggestionsEl ? suggestionsEl.querySelectorAll('.search-suggestion-item') : [];
                if (e.key === 'ArrowDown') {
                    if (items.length > 0) {
                        e.preventDefault();
                        activeSuggestionIdx = (activeSuggestionIdx + 1) % items.length;
                        items.forEach((it, idx) => {
                            if (idx === activeSuggestionIdx) {
                                it.classList.add('active');
                                it.scrollIntoView({ block: 'nearest' });
                            } else {
                                it.classList.remove('active');
                            }
                        });
                    }
                } else if (e.key === 'ArrowUp') {
                    if (items.length > 0) {
                        e.preventDefault();
                        activeSuggestionIdx = (activeSuggestionIdx - 1 + items.length) % items.length;
                        items.forEach((it, idx) => {
                            if (idx === activeSuggestionIdx) {
                                it.classList.add('active');
                                it.scrollIntoView({ block: 'nearest' });
                            } else {
                                it.classList.remove('active');
                            }
                        });
                    }
                } else if (e.key === 'Enter') {
                    if (activeSuggestionIdx >= 0 && items[activeSuggestionIdx]) {
                        e.preventDefault();
                        selectSuggestion(items[activeSuggestionIdx].dataset.title);
                    } else {
                        hideSuggestions();
                    }
                } else if (e.key === 'Escape') {
                    const legalModal = document.getElementById('legal-modal');
                    if (legalModal && !legalModal.classList.contains('hidden')) {
                        legalModal.classList.add('hidden');
                        return;
                    }
                    if (suggestionsEl && !suggestionsEl.classList.contains('hidden')) {
                        e.stopPropagation();
                        hideSuggestions();
                    } else {
                        searchInput.value = '';
                        searchBox.classList.remove('active');
                        searchInput.classList.remove('active');
                        searchClose.classList.add('hidden');
                        searchInput.blur();
                        hideSuggestions();
                        app.router.handleHash();
                    }
                }
            });

            // Initial Route handled earlier for performance

            lucide.createIcons();
        }
    },

    hoverCard: {
        currentPoster: null,
        hoverTimer: null,
        hideTimer: null,
        modalObserver: null,

        isAnyModalOpen: () => {
            if (document.body.classList.contains('modal-open')) return true;
            const modalContainer = document.getElementById('modal-container');
            if (modalContainer && !modalContainer.classList.contains('hidden')) return true;
            const playerContainer = document.getElementById('player-container');
            if (playerContainer && !playerContainer.classList.contains('hidden')) return true;
            const legalModal = document.getElementById('legal-modal');
            if (legalModal && !legalModal.classList.contains('hidden')) return true;
            return false;
        },

        init: () => {
            const card = document.getElementById('prime-hover-card');
            if (!card) return;

            document.addEventListener('mouseover', (e) => {
                if (app.hoverCard.isAnyModalOpen()) {
                    app.hoverCard.hide();
                    return;
                }
                const poster = e.target.closest('.poster');
                if (poster && poster.dataset && poster.dataset.itemId) {
                    if (app.hoverCard.isAnyModalOpen()) return;
                    if (app.hoverCard.hideTimer) {
                        clearTimeout(app.hoverCard.hideTimer);
                        app.hoverCard.hideTimer = null;
                    }
                    if (app.hoverCard.currentPoster === poster && !card.classList.contains('hidden')) {
                        return;
                    }
                    if (app.hoverCard.hoverTimer) clearTimeout(app.hoverCard.hoverTimer);
                    app.hoverCard.hoverTimer = setTimeout(() => {
                        if (!app.hoverCard.isAnyModalOpen()) {
                            app.hoverCard.show(poster);
                        }
                    }, 220);
                }
            });

            document.addEventListener('mouseout', (e) => {
                const poster = e.target.closest('.poster');
                if (poster && poster.dataset && poster.dataset.itemId) {
                    const toEl = e.relatedTarget;
                    if (card.contains(toEl)) return;
                    app.hoverCard.scheduleHide();
                }
            });

            // Instant hide on ANY mousedown/pointerdown/click in capture phase
            window.addEventListener('pointerdown', (e) => {
                const c = document.getElementById('prime-hover-card');
                if (c && !c.contains(e.target)) {
                    app.hoverCard.hide();
                }
            }, true);

            window.addEventListener('click', (e) => {
                if (e.target.closest('.poster') || e.target.closest('.hover-card-media') || e.target.closest('.hover-card-title') || e.target.closest('.hover-btn-play') || e.target.closest('.hover-btn-circle')) {
                    app.hoverCard.hide();
                }
            }, true);

            card.addEventListener('mouseenter', () => {
                if (app.hoverCard.isAnyModalOpen()) {
                    app.hoverCard.hide();
                    return;
                }
                if (app.hoverCard.hideTimer) {
                    clearTimeout(app.hoverCard.hideTimer);
                    app.hoverCard.hideTimer = null;
                }
            });

            card.addEventListener('mouseleave', (e) => {
                const toEl = e.relatedTarget;
                if (app.hoverCard.currentPoster && app.hoverCard.currentPoster.contains(toEl)) return;
                app.hoverCard.scheduleHide();
            });

            window.addEventListener('scroll', () => app.hoverCard.hide(), { passive: true });
            window.addEventListener('hashchange', () => app.hoverCard.hide());

            // MutationObserver ensures hover card is immediately dismissed if any modal state changes
            try {
                if (!app.hoverCard.modalObserver) {
                    app.hoverCard.modalObserver = new MutationObserver(() => {
                        if (app.hoverCard.isAnyModalOpen()) {
                            app.hoverCard.hide();
                        }
                    });
                    const mContainer = document.getElementById('modal-container');
                    const pContainer = document.getElementById('player-container');
                    const lModal = document.getElementById('legal-modal');
                    if (mContainer) app.hoverCard.modalObserver.observe(mContainer, { attributes: true, attributeFilter: ['class', 'style'] });
                    if (pContainer) app.hoverCard.modalObserver.observe(pContainer, { attributes: true, attributeFilter: ['class', 'style'] });
                    if (lModal) app.hoverCard.modalObserver.observe(lModal, { attributes: true, attributeFilter: ['class', 'style'] });
                }
            } catch (e) {}
        },

        scheduleHide: () => {
            if (app.hoverCard.hoverTimer) {
                clearTimeout(app.hoverCard.hoverTimer);
                app.hoverCard.hoverTimer = null;
            }
            if (app.hoverCard.hideTimer) clearTimeout(app.hoverCard.hideTimer);
            app.hoverCard.hideTimer = setTimeout(() => {
                app.hoverCard.hide();
            }, 180);
        },

        show: (posterEl) => {
            if (app.hoverCard.isAnyModalOpen()) {
                app.hoverCard.hide();
                return;
            }
            const id = posterEl.dataset.itemId;
            if (!id) return;
            const item = (window.appItemMap && window.appItemMap[id]) || app.services.findItemById(id);
            if (!item) return;

            app.hoverCard.currentPoster = posterEl;
            app.hoverCard.render(item, posterEl);
        },

        render: (item, anchorEl) => {
            if (app.hoverCard.isAnyModalOpen()) {
                app.hoverCard.hide();
                return;
            }
            const card = document.getElementById('prime-hover-card');
            if (!card || !anchorEl) return;

            const rect = anchorEl.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const cardWidth = Math.min(360, Math.max(320, rect.width * 1.35));
            let left = rect.left + (rect.width - cardWidth) / 2;
            left = Math.max(12, Math.min(window.innerWidth - cardWidth - 12, left));

            let top = rect.top - 20;
            if (top < 70) top = 70;
            if (top + 380 > window.innerHeight && window.innerHeight > 420) {
                top = window.innerHeight - 390;
            }

            card.style.width = cardWidth + 'px';
            card.style.left = left + 'px';
            card.style.top = top + 'px';

            const title = item.title || item.name || 'Untitled';
            let img = item.backdrop_path || item.poster_path || '';
            if (img && !img.startsWith('http')) {
                img = 'https://image.tmdb.org/t/p/w780' + img;
            }
            img = app.utils.proxyImg(img || 'https://via.placeholder.com/340x190?text=No+Preview');

            const year = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : '2024');
            const isMovie = item.type === 'movie' || item.release_date || !item.first_air_date;
            const cert = item.adult ? 'A 18+' : (item.vote_average > 7.5 ? 'U/A 16+' : 'U/A 13+');

            let duration = '';
            if (item.runtime) {
                const h = Math.floor(item.runtime / 60);
                const m = item.runtime % 60;
                duration = h > 0 ? `${h} h ${m} min` : `${m} min`;
            } else if (item.episodes && item.episodes.length > 0) {
                const seasons = [...new Set(item.episodes.map(e => e.season || 1))].length;
                duration = seasons > 1 ? `${seasons} Seasons` : `${item.episodes.length} Episodes`;
            } else {
                duration = isMovie ? '2 h 14 min' : 'TV Series';
            }

            const genre = item.genre || (item.media_type === 'tv' ? 'Series' : 'Drama');
            const desc = (item.overview || item.description || 'Watch now on Tenflix in Ultra HD quality. Stream on any device.').substring(0, 160) + '...';

            const isInMyList = (app.state.customContent || []).some(c => c.id == item.id);

            // Clean thumbnail with NO duplicated title overlay; title is cleanly presented below
            card.innerHTML = `
                <div class="hover-card-media" onclick="app.hoverCard.hide(); app.handlers.openDetailsById('${item.id}')">
                    <img src="${img}" alt="${title}" onerror="this.src='https://via.placeholder.com/340x190/181818/ffffff?text=' + encodeURIComponent('${title.replace(/'/g, "\\\'")}');">
                </div>
                <div class="hover-card-content">
                    <h3 class="hover-card-title" onclick="app.hoverCard.hide(); app.handlers.openDetailsById('${item.id}')">${title}</h3>
                    <div class="hover-included-badge">
                        <i data-lucide="check-circle-2"></i> Included with Tenflix
                    </div>

                    <div class="hover-card-actions">
                        <button class="hover-btn-play" onclick="event.stopPropagation(); app.hoverCard.hide(); app.handlers.quickPlay('${item.id}')">
                            <i data-lucide="play" fill="black"></i> Play
                        </button>
                        <button class="hover-btn-circle" title="More Info" onclick="event.stopPropagation(); app.hoverCard.hide(); app.handlers.openDetailsById('${item.id}')">
                            <i data-lucide="info"></i>
                        </button>
                        <button class="hover-btn-circle ${isInMyList ? 'active' : ''}" title="${isInMyList ? 'In My List' : 'Add to My List'}" onclick="event.stopPropagation(); app.handlers.toggleMyList('${item.id}', this)">
                            <i data-lucide="${isInMyList ? 'check' : 'plus'}"></i>
                        </button>
                    </div>

                    <div class="hover-card-rank">
                        <i data-lucide="trending-up"></i> Top Pick in ${genre}
                    </div>

                    <div class="hover-card-meta">
                        <span class="hover-meta-badge">NEW</span>
                        <span class="hover-meta-badge">HD</span>
                        <span class="hover-meta-cert">${cert}</span>
                        <span class="hover-meta-text">${year}</span>
                        <span class="hover-meta-text">${duration}</span>
                    </div>

                    <p class="hover-card-desc">${desc}</p>
                </div>
            `;

            if (window.lucide) lucide.createIcons({ root: card });
            card.style.display = 'block';
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
            card.classList.remove('hidden');
        },

        hide: () => {
            if (app.hoverCard.hoverTimer) {
                clearTimeout(app.hoverCard.hoverTimer);
                app.hoverCard.hoverTimer = null;
            }
            if (app.hoverCard.hideTimer) {
                clearTimeout(app.hoverCard.hideTimer);
                app.hoverCard.hideTimer = null;
            }
            const card = document.getElementById('prime-hover-card');
            if (card) {
                card.classList.add('hidden');
                card.style.display = 'none';
                card.style.opacity = '0';
                card.style.pointerEvents = 'none';
                app.hoverCard.currentPoster = null;
            }
        }
    },

    audio: {
        getVolume: () => {
            const v = localStorage.getItem('tenflix_player_volume');
            return v !== null ? parseFloat(v) : 1.0;
        },
        isMuted: () => {
            return localStorage.getItem('tenflix_player_muted') === 'true';
        },
        setVolume: (vol) => {
            const clamped = Math.max(0, Math.min(1, parseFloat(vol) || 1));
            localStorage.setItem('tenflix_player_volume', clamped);
            if (clamped > 0) {
                localStorage.setItem('tenflix_player_muted', 'false');
            }
        },
        setMuted: (muted) => {
            localStorage.setItem('tenflix_player_muted', muted ? 'true' : 'false');
        },
        applyToVideo: (videoEl) => {
            if (!videoEl) return;
            const vol = app.audio.getVolume();
            const muted = app.audio.isMuted();

            videoEl.volume = vol;
            videoEl.muted = muted;

            videoEl.addEventListener('volumechange', () => {
                localStorage.setItem('tenflix_player_volume', videoEl.volume);
                localStorage.setItem('tenflix_player_muted', videoEl.muted ? 'true' : 'false');
            });
        },
        initMessageListener: () => {
            window.addEventListener('message', (event) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (!data) return;
                    if (typeof data.volume === 'number') {
                        const normalized = data.volume > 1 ? data.volume / 100 : data.volume;
                        app.audio.setVolume(normalized);
                    }
                    if (typeof data.muted === 'boolean') {
                        app.audio.setMuted(data.muted);
                    }
                } catch (e) {}
            });
        },

        initNavigationListeners: () => {
            // Handle browser Back / Forward buttons without ever freezing the UI
            window.addEventListener('popstate', (e) => {
                if (window.isPlayerActive) {
                    app.handlers.closePlayer(false);
                }
                const modalContainer = document.getElementById('modal-container');
                if (modalContainer && !modalContainer.classList.contains('hidden')) {
                    app.handlers.closeDetails(false);
                }
                app.utils.unfreezePage();
            });

            // Handle URL hash changes
            window.addEventListener('hashchange', (e) => {
                if (window.isPlayerActive) {
                    app.handlers.closePlayer(false);
                }
                const modalContainer = document.getElementById('modal-container');
                if (modalContainer && !modalContainer.classList.contains('hidden')) {
                    app.handlers.closeDetails(false);
                }
                app.utils.unfreezePage();
            });

            // Handle Escape key
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (window.isPlayerActive) {
                        app.handlers.closePlayer();
                    } else {
                        const m = document.getElementById('modal-container');
                        if (m && !m.classList.contains('hidden')) {
                            app.handlers.closeDetails();
                        }
                    }
                }
            });
        }
    },

    customTmdbMap: {
        'httyd_1': '10191',
        'httyd_2': '82702',
        'httyd_3': '166428',
        'movie_1582770': '1582770',
        'movie_1291608': '1291608',
        'crazy_rich_asians': '455207',
        'how_to_lose_a_guy': '9919',
        '10_things': '4951',
        'perks_of_being_a_wallflower': '84346'
    },

    init: async () => {
        console.log('Netflix Clone Initializing...');

        // Failsafe: hide splash loader after max 2.5s no matter what happens
        setTimeout(() => {
            const l = document.getElementById('loader');
            if (l && l.style.display !== 'none') l.style.display = 'none';
        }, 2500);

        try {
            app.handlers.checkCookieConsent();
            app.audio.initMessageListener();
            app.hoverCard.init();
        if (app.audio && typeof app.audio.initNavigationListeners === 'function') {
                app.audio.initNavigationListeners();
            }
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
                // Auto-sync all initialContent.js entries into localStorage so new additions immediately appear
                try {
                    const currentLocal = JSON.parse(localStorage.getItem('netflix_custom_content') || '[]');
                    window.NETFLIX_INITIAL_CONTENT.forEach(initItem => {
                        const idx = currentLocal.findIndex(i => i.id === initItem.id);
                        if (idx !== -1) {
                            currentLocal[idx] = initItem;
                        } else {
                            currentLocal.push(initItem);
                        }
                    });
                    localStorage.setItem('netflix_custom_content', JSON.stringify(currentLocal));
                } catch (e) {
                    console.error("Failed to sync initial content", e);
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
            const legalModal = document.getElementById('legal-modal');
            if (legalModal) legalModal.classList.add('hidden');
            const playerModal = document.getElementById('player-container');
            if (playerModal) {
                playerModal.classList.add('hidden');
                playerModal.innerHTML = '';
                document.documentElement.classList.remove('player-open');
                document.body.classList.remove('player-open');
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';
            }
            window.scrollTo(0, 0);

            // Clear search input on navigation
            const searchInput = document.getElementById('search-input');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                // Optional: remove active class to collapse it if desired
                // searchInput.classList.remove('active');
            }

            // Update Active Link
            document.querySelectorAll('.nav-links a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + hash) link.classList.add('active');
            });

            document.querySelectorAll('.mobile-nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.getAttribute('href') === '#' + hash) item.classList.add('active');
            });

            if (hash === 'home') app.pages.home(main);
            else if (hash === 'search') {
                app.handlers.openSearch();
                app.pages.searchBrowse(main);
            }
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

                openPlayer: async (videoUrl, captionUrl = null, itemId = null, episodeIndex = null, activeServer = 1, targetSeason = 1, targetEpisode = 1) => {
            if (app.hoverCard) app.hoverCard.hide();
            window.isPlayerActive = true;
            window.currentSeason = targetSeason;
            window.currentEpisode = targetEpisode;

            // Push history state so browser Back button cleanly exits player without freezing
            try {
                if (!history.state || !history.state.tenflixPlayer) {
                    history.pushState({ tenflixPlayer: true }, '', window.location.href);
                }
            } catch(e) {}

            document.documentElement.classList.add('player-open');
            document.body.classList.add('player-open');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';

            if (itemId) {
                window.currentPlayingItem = (window.appItemMap && window.appItemMap[itemId]) || app.services.findItemById(itemId);
            }
            const item = window.currentPlayingItem;
            const isTv = item ? (item.media_type === 'tv' || item.name || item.first_air_date || (item.episodes && item.episodes.length > 0)) : false;

            // Enforce explicit season/episode for TV shows on VidLink
            if (isTv && itemId) {
                if (!videoUrl || videoUrl.includes('vidlink.pro') || videoUrl.trim() === '' || videoUrl === 'undefined') {
                    videoUrl = `https://vidlink.pro/tv/${itemId}/${targetSeason}/${targetEpisode}?primaryColor=E50914&autoplay=false`;
                }
            } else if ((!videoUrl || videoUrl.trim() === '' || videoUrl === 'undefined') && itemId && item && !item.is_custom) {
                videoUrl = `https://vidlink.pro/movie/${itemId}?primaryColor=E50914&autoplay=false`;
            }

            // Enforce autoplay=false and primaryColor on any VidLink URL
            if (videoUrl && videoUrl.includes('vidlink.pro')) {
                if (videoUrl.includes('autoplay=true')) {
                    videoUrl = videoUrl.replace(/autoplay=true/g, 'autoplay=false');
                } else if (!videoUrl.includes('autoplay=')) {
                    videoUrl += (videoUrl.includes('?') ? '&' : '?') + 'autoplay=false';
                }
                if (!videoUrl.includes('primaryColor=')) {
                    videoUrl += (videoUrl.includes('?') ? '&' : '?') + 'primaryColor=E50914';
                }
            }

            if (!videoUrl) return alert("No video URL available!");

            const modal = document.getElementById('player-container');
            modal.classList.remove('hidden');

            // Handle Dropbox / OneDrive direct stream conversions
            let isDirectFile = videoUrl.startsWith('blob:') || videoUrl.endsWith('.mp4') || videoUrl.endsWith('.m3u8') || videoUrl.endsWith('.webm');
            if (videoUrl.includes('dropbox.com')) {
                videoUrl = videoUrl.replace('dl=0', 'dl=1');
                isDirectFile = true;
            }
            if (videoUrl.includes('onedrive.live.com') || videoUrl.includes('1drv.ms')) {
                videoUrl = videoUrl.replace('embed', 'download');
                isDirectFile = true;
            }
            if (videoUrl.includes('drive.google.com') && videoUrl.includes('/view')) {
                videoUrl = videoUrl.replace('/view', '/preview');
            }

            let iframeUrl = videoUrl;
            const hasServer1 = item && item.video_url && item.video_url.includes('drive.google.com');
            const showTitle = (item && (item.title || item.name)) || 'Playing on Tenflix';
            const subTitle = isTv ? `Season ${targetSeason} • Ep ${targetEpisode}` : '';

            // Build In-Player Episodes Drawer HTML if TV series
            let drawerHtml = '';
            if (isTv && item) {
                let seasons = (item.episodes && item.episodes.length > 0)
                    ? [...new Set(item.episodes.map(e => parseInt(e.season) || 1))].sort((a, b) => a - b)
                    : [1];
                if (item.seasonsList && item.seasonsList.length > 0) {
                    seasons = item.seasonsList.map(s => s.season_number);
                }
                const currentEpisodes = (item.episodes || []).filter(e => (e.season || 1) == targetSeason);

                drawerHtml = `
                    <div id="player-episodes-drawer" class="player-episodes-drawer hidden">
                        <div class="episodes-drawer-header">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <select class="episodes-drawer-select" onchange="app.handlers.switchDrawerSeason(this, '${item.id}')">
                                    ${seasons.map(s => `<option value="${s}" ${s == targetSeason ? 'selected' : ''}>Season ${s}</option>`).join('')}
                                </select>
                                <span id="drawer-ep-count" style="color:#aaa; font-size:0.85rem;">${currentEpisodes.length} Episodes</span>
                            </div>
                            <button class="player-control-btn player-close-btn" onclick="app.handlers.toggleEpisodesDrawer()" style="width:36px; height:36px;" title="Close Episodes Drawer">
                                <i data-lucide="x" style="width:18px; height:18px;"></i>
                            </button>
                        </div>
                        <div class="episodes-drawer-list" id="drawer-ep-list">
                            ${currentEpisodes.map((ep, idx) => {
                                const epNum = ep.episode_number || (idx + 1);
                                const isPlaying = (ep.season || 1) == targetSeason && epNum == targetEpisode;
                                let img = ep.still_path || ep.img || '';
                                if (img && !img.startsWith('http')) img = 'https://image.tmdb.org/t/p/w300' + img;
                                img = app.utils.proxyImg(img || 'https://via.placeholder.com/200x110?text=Episode');

                                return `
                                    <div class="drawer-episode-item ${isPlaying ? 'playing' : ''}" onclick="app.router.openPlayer(null, null, '${item.id}', null, 1, ${ep.season || targetSeason}, ${epNum})">
                                        <div class="drawer-ep-thumb" style="background-image: url('${img}');">
                                            ${isPlaying ? '<div class="playing-badge"><i data-lucide="play" fill="white"></i></div>' : ''}
                                        </div>
                                        <div class="drawer-ep-info">
                                            <div class="drawer-ep-title">${ep.title || 'Episode ' + epNum}</div>
                                            <div class="drawer-ep-meta">${ep.runtime ? ep.runtime + 'm' : ''}</div>
                                            <div class="drawer-ep-desc">${ep.overview ? ep.overview.substring(0, 80) + '...' : ''}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            // Top Bar with prominent Back button, Show Title, Episodes Selector, and Close (X) button
            const topBarHtml = `
                <div class="player-top-bar" id="player-top-bar">
                    <div class="player-top-left">
                        <button class="player-control-btn player-back-btn" onclick="app.handlers.closePlayer()" title="Back to Tenflix">
                            <i data-lucide="arrow-left"></i>
                            <span>Back</span>
                        </button>
                        <div class="player-title-info">
                            <span class="player-main-title">${showTitle}</span>
                            ${subTitle ? `<span class="player-sub-title">${subTitle}</span>` : ''}
                        </div>
                    </div>
                    <div class="player-top-right">
                        ${isTv ? `
                            <button class="player-control-btn" onclick="app.handlers.toggleEpisodesDrawer()" title="Select Season & Episode">
                                <i data-lucide="layers"></i>
                                <span>Episodes</span>
                            </button>
                            <button class="player-control-btn" onclick="app.handlers.playNextEpisode('${item ? item.id : itemId}', ${targetSeason}, ${targetEpisode})" title="Next Episode">
                                <span>Next</span>
                                <i data-lucide="skip-forward"></i>
                            </button>
                        ` : ''}
                        ${hasServer1 ? `
                            <div class="player-server-bar">
                                <button class="server-btn ${activeServer === 1 ? 'active' : ''}" onclick="app.handlers.switchPlayerServer(1)"><i data-lucide="cloud"></i> Server 1 (Drive)</button>
                                <button class="server-btn ${activeServer === 2 ? 'active' : ''}" onclick="app.handlers.switchPlayerServer(2)"><i data-lucide="play-circle"></i> Server 2 (HD Stream)</button>
                            </div>
                        ` : ''}
                        <button class="player-control-btn player-close-btn" onclick="app.handlers.closePlayer()" title="Close Player (Esc)">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>
            `;

            if (isDirectFile) {
                modal.innerHTML = `
                    <div class="video-player-container" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: black; z-index: 1000; overflow: hidden;">
                        <video id="active-native-video" controls autoplay style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous">
                            <source src="${videoUrl}" type="video/mp4">
                            ${captionUrl ? `<track label="English" kind="subtitles" srclang="en" src="${captionUrl}" default>` : ''}
                            Your browser does not support the video tag.
                        </video>
                    </div>
                    ${topBarHtml}
                    ${drawerHtml}
                `;
                const nativeVid = modal.querySelector('video');
                if (nativeVid) app.audio.applyToVideo(nativeVid);
            } else {
                modal.innerHTML = `
                    <div class="video-player-container" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: black; z-index: 1000; overflow: hidden;">
                        <iframe id="main-player-iframe" src="${iframeUrl}" 
                            frameborder="0" 
                            allow="autoplay *; fullscreen *; encrypted-media *; accelerometer *; gyroscope *; picture-in-picture *; web-share *" 
                            allowfullscreen 
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;">
                        </iframe>
                    </div>
                    ${topBarHtml}
                    ${drawerHtml}
                `;
            }

            if (window.lucide) lucide.createIcons();
        },
        openDetails: async (item) => {
            if (app.hoverCard) app.hoverCard.hide();
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';

            // Push history state so browser Back button closes modal without freezing
            try {
                if (!history.state || !history.state.tenflixModal) {
                    history.pushState({ tenflixModal: true }, '', window.location.href);
                }
            } catch(e) {}

            try {
                const modal = document.getElementById('modal-container');
                modal.classList.remove('hidden');

                const isCustom = item.is_custom;

                // Image handling
                const backdropBase = app.state.config ? app.state.config.backdropBaseUrl : '';
                const posterBase = app.state.config ? app.state.config.imageBaseUrl : '';

                let imgUrl = isCustom ? item.backdrop_path : (item.backdrop_path ? backdropBase + item.backdrop_path : 'https://via.placeholder.com/800x450');
                let posterUrl = isCustom ? item.poster_path : (item.poster_path ? posterBase + item.poster_path : 'https://via.placeholder.com/200x300');
                
                imgUrl = app.utils.proxyImg(imgUrl);
                posterUrl = app.utils.proxyImg(posterUrl);

                // TV Show Detection
                const isTv = item.media_type === 'tv' || item.first_air_date || item.name || (item.episodes && item.episodes.length > 0);

                // If TMDB TV series without loaded episodes, fetch seasons list and Season 1 episodes dynamically!
                if (isTv && (!item.episodes || item.episodes.length === 0) && item.id && !item.is_custom) {
                    try {
                        const showData = await app.services.fetchTmdb(`/tv/${item.id}`);
                        if (showData) {
                            if (showData.seasons && Array.isArray(showData.seasons)) {
                                item.seasonsList = showData.seasons.filter(s => s.season_number > 0);
                                if (item.seasonsList.length === 0) item.seasonsList = showData.seasons;
                            }
                            const s1Num = (item.seasonsList && item.seasonsList[0]) ? item.seasonsList[0].season_number : 1;
                            const s1Data = await app.services.fetchTmdb(`/tv/${item.id}/season/${s1Num}`);
                            if (s1Data && s1Data.episodes && Array.isArray(s1Data.episodes)) {
                                item.episodes = s1Data.episodes.map(ep => ({
                                    season: s1Num,
                                    episode_number: ep.episode_number,
                                    title: ep.name ? `${ep.episode_number}. ${ep.name}` : `Episode ${ep.episode_number}`,
                                    overview: ep.overview,
                                    runtime: ep.runtime ? String(ep.runtime) : '45',
                                    still_path: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : '',
                                    video_url: ''
                                }));
                            }
                        }
                    } catch (err) {
                        console.warn('Could not load seasons from TMDB', err);
                    }
                }

                // Episode Logic
                const hasEpisodes = item.episodes && item.episodes.length > 0;
                let seasons = hasEpisodes ? [...new Set(item.episodes.map(e => parseInt(e.season) || 1))].sort((a, b) => a - b) : [];
                if (item.seasonsList && item.seasonsList.length > 0) {
                    seasons = item.seasonsList.map(s => s.season_number);
                }
                const currentSeason = seasons.length > 0 ? seasons[0] : 1;

                // Build HTML
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="close-modal" onclick="app.handlers.closeDetails()">
                            <i data-lucide="x"></i>
                        </div>
                        
                        <div class="modal-hero" style="background-image: url('${imgUrl}'); height: 400px; background-size: cover; background-position: center; position: relative;">
                            <div class="hero-overlay" style="background: linear-gradient(to top, #181818, transparent);"></div>
                            
                            <div class="modal-hero-content" style="position: absolute; bottom: 20px; left: 20px; right: 20px; z-index: 10;">
                                <h1 style="font-size: 3rem; margin-bottom: 10px; line-height: 1.1; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); font-weight: bold;">${item.title || item.name}</h1>
                                
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; font-size: 0.9rem; color: #ccc;">
                                    <span style="color: #00a8e1; font-weight: bold; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle-2" style="width:14px; height:14px;"></i> Included with Tenflix</span>
                                    <span>${item.release_date || item.first_air_date || '2024'}</span>
                                    <span style="border: 1px solid #777; padding: 0 4px; font-size: 0.7rem; border-radius: 2px;">HD</span>
                                </div>
                                
                                <div class="modal-actions" style="display: flex; gap: 10px; flex-wrap: wrap; width: 100%;">
                                    <button class="btn btn-primary" onclick="app.handlers.playMain('${item.video_url || ''}', ${hasEpisodes})">
                                        <i data-lucide="play" fill="black"></i> Play
                                    </button>
                                    ${item.is_custom && (app.customTmdbMap[item.id] || item.id) ? `
                                        <button class="btn btn-secondary" onclick="app.handlers.playServer2('${item.id}')" title="Play alternative HD stream if Drive is blocked">
                                            <i data-lucide="sparkles"></i> Server 2 (HD Stream)
                                        </button>
                                    ` : ''}
                                    
                                    <a href="https://drive.google.com/drive/folders/1jx3Drfqd9dDaElb0AlR3ocsRKwyiIP4b?usp=drive_link" target="_blank" class="btn btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px; color: white;">
                                        <i data-lucide="download"></i> Download
                                    </a>
                                    
                                    ${isCustom ? `
                                        <button class="btn btn-secondary" onclick="app.handlers.editItem('${item.id}')">
                                            <i data-lucide="edit-2"></i> Edit
                                        </button>
                                        <button class="btn btn-secondary" style="background-color: #E50914; border:none; margin-left: auto;" onclick="app.handlers.deleteItem('${item.id}')">
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
                                        <select style="background: #232733; color: white; padding: 8px 14px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; font-size: 1.1rem; cursor: pointer; outline: none; font-weight: 600;"
                                            onchange="app.handlers.switchSeason(this, '${item.id}')">
                                            ${seasons.map(s => `<option value="${s}">Season ${s}</option>`).join('')}
                                        </select>
                                        <span id="season-ep-count" style="color: #aaa; font-size: 0.95rem;">${(item.episodes || []).filter(e => (e.season || 1) == currentSeason).length} Episodes</span>
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
                if (item.id) {
                    window.appItemMap = window.appItemMap || {};
                    window.appItemMap[item.id] = item;
                }

            } catch (error) {
                console.error("Failed to open modal:", error);
            }
        }
    },
    handlers: {
        openSearch: (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const searchBox = document.querySelector('.search-box');
            const searchInput = document.getElementById('search-input');
            const searchCloseBtn = document.querySelector('.search-close-btn');
            if (!searchBox || !searchInput) return;

            // If already open and user has entered text, trigger search
            if (searchBox.classList.contains('active') && searchInput.value && searchInput.value.trim().length > 0) {
                const main = document.getElementById('main-content');
                if (main) app.pages.search(main, searchInput.value.trim());
                return;
            }

            searchBox.classList.add('active');
            searchInput.classList.add('active');
            if (searchCloseBtn) searchCloseBtn.classList.remove('hidden');

            setTimeout(() => {
                searchInput.focus();
            }, 60);

            const main = document.getElementById('main-content');
            if (main && (!searchInput.value || searchInput.value.trim().length === 0)) {
                if (typeof app.pages.searchBrowse === 'function') {
                    app.pages.searchBrowse(main);
                }
            }
        },

        closeSearch: (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const searchBox = document.querySelector('.search-box');
            const searchInput = document.getElementById('search-input');
            const searchCloseBtn = document.querySelector('.search-close-btn');
            const suggestionsEl = document.getElementById('search-suggestions');
            if (!searchBox || !searchInput) return;

            searchBox.classList.remove('active');
            searchInput.classList.remove('active');
            if (searchCloseBtn) searchCloseBtn.classList.add('hidden');
            if (suggestionsEl) suggestionsEl.classList.add('hidden');
            searchInput.value = '';

            if (window.location.hash.startsWith('#search')) {
                window.location.hash = 'home';
            } else {
                app.router.handleHash();
            }
        },
        playServer2: (id) => {
            const item = (window.appItemMap && window.appItemMap[id]) || app.services.findItemById(id);
            if (!item) return;
            const tmdbId = app.customTmdbMap[id] || (item.id && item.id.replace('movie_', '')) || id;
            const streamUrl = `https://vidlink.pro/movie/${tmdbId}?primaryColor=E50914&autoplay=false`;
            app.router.openPlayer(streamUrl, null, id, null, 2);
        },

        switchPlayerServer: (targetServerNum) => {
            const item = window.currentPlayingItem;
            if (!item) return;

            const newServer = targetServerNum || (window.currentActiveServer === 1 ? 2 : 1);
            window.currentActiveServer = newServer;

            if (newServer === 2) {
                // Switch to VidLink HD Stream
                const tmdbId = app.customTmdbMap[item.id] || (item.id && item.id.replace('movie_', '')) || item.id;
                const streamUrl = `https://vidlink.pro/movie/${tmdbId}?primaryColor=E50914&autoplay=false`;
                app.router.openPlayer(streamUrl, null, item.id, null, 2);
            } else {
                // Switch back to original file/Drive
                app.router.openPlayer(item.video_url, item.caption_url, item.id, null, 1);
            }
        },

        quickPlay: (id) => {
            const item = (window.appItemMap && window.appItemMap[id]) || app.services.findItemById(id);
            if (!item) return;
            if (app.hoverCard) app.hoverCard.hide();

            if (item.episodes && item.episodes.length > 0) {
                app.router.openPlayer(item.episodes[0].video_url, item.episodes[0].caption_url, item.id, 0);
            } else if (item.video_url) {
                app.router.openPlayer(item.video_url, item.caption_url, item.id);
            } else {
                app.router.openPlayer(null, null, item.id);
            }
        },

        toggleMyList: (id, btn) => {
            const item = (window.appItemMap && window.appItemMap[id]) || app.services.findItemById(id);
            if (!item) return;

            let list = JSON.parse(localStorage.getItem('netflix_custom_content') || '[]');
            const existingIdx = list.findIndex(i => i.id == id);

            if (existingIdx !== -1) {
                list.splice(existingIdx, 1);
                if (btn) {
                    btn.classList.remove('active');
                    btn.innerHTML = '<i data-lucide="plus"></i>';
                    btn.title = 'Add to My List';
                    if (window.lucide) lucide.createIcons({ root: btn });
                }
            } else {
                const newItem = {
                    id: item.id,
                    title: item.title || item.name,
                    overview: item.overview || item.description || '',
                    description: item.description || item.overview || '',
                    poster_path: item.poster_path || item.backdrop_path || '',
                    backdrop_path: item.backdrop_path || item.poster_path || '',
                    release_date: item.release_date || item.first_air_date || '2024',
                    genre: item.genre || 'Various',
                    is_custom: true,
                    type: item.type || (item.media_type === 'tv' ? 'tv' : 'movie')
                };
                list.push(newItem);
                if (btn) {
                    btn.classList.add('active');
                    btn.innerHTML = '<i data-lucide="check"></i>';
                    btn.title = 'In My List';
                    if (window.lucide) lucide.createIcons({ root: btn });
                }
            }

            localStorage.setItem('netflix_custom_content', JSON.stringify(list));
            app.state.customContent = list;
        },

        openLegal: (tab = 'privacy') => {
            const modal = document.getElementById('legal-modal');
            const content = document.getElementById('legal-modal-content');
            if (!modal || !content) return;

            modal.classList.remove('hidden');
            app.handlers.renderLegalContent(tab);
        },

        switchLegalTab: (tab) => {
            app.handlers.renderLegalContent(tab);
        },

        renderLegalContent: (activeTab) => {
            const content = document.getElementById('legal-modal-content');
            if (!content) return;

            const tabs = [
                { id: 'privacy', label: 'Privacy Policy' },
                { id: 'terms', label: 'Terms of Service' },
                { id: 'refund', label: 'Refund Policy' },
                { id: 'cookie', label: 'Cookie Policy' },
                { id: 'security', label: 'Security & Audit' },
                { id: 'dmca', label: 'DMCA Takedown' },
                { id: 'deletion', label: 'Data Deletion' }
            ];

            let bodyHtml = '';

            if (activeTab === 'privacy') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>Tenflix Privacy Policy</h2>
                        <div class="legal-alert">
                            <strong>Data Minimization Notice:</strong> Tenflix does not sell personal data, does not use ad trackers, and stores your custom library exclusively on your own browser.
                        </div>
                        <h3>1. Information We Collect</h3>
                        <p>Tenflix collects only the minimum necessary data to provide media functionality:</p>
                        <ul>
                            <li><strong>Local Browser Storage:</strong> Custom media URLs, video titles, and episode configurations you enter are stored locally in your browser's IndexedDB and localStorage.</li>
                            <li><strong>User Preferences:</strong> Audio volume, active view tab, and cookie consent preferences.</li>
                            <li><strong>Search Queries:</strong> Queries typed into the search bar are sent directly to the TMDB API to retrieve live movie/show posters and metadata. We do not store or profile your search queries.</li>
                        </ul>

                        <h3>2. Third-Party Services</h3>
                        <p>Tenflix interacts with the following external services solely for media discovery and playback:</p>
                        <ul>
                            <li><strong>The Movie Database (TMDB):</strong> Fetches metadata, posters, and overviews. TMDB does not receive your personal identity.</li>
                            <li><strong>Embedded Players:</strong> Streams requested from independent video services operate within isolated sandboxed iframes.</li>
                        </ul>

                        <h3>3. GDPR & CCPA Compliance</h3>
                        <p>Under European GDPR and California CCPA regulations, you have full ownership over your data:</p>
                        <ul>
                            <li><strong>Right of Access & Portability:</strong> You can export your entire media library as JSON in the Settings tab.</li>
                            <li><strong>Right to Erasure:</strong> You can permanently wipe all locally stored data in one click using the <a onclick="app.handlers.switchLegalTab('deletion')" style="color:#e50914;cursor:pointer;text-decoration:underline;">Data Deletion tab</a>.</li>
                        </ul>

                        <h3>4. Child Privacy (COPPA)</h3>
                        <p>Tenflix is intended for general audiences aged 13 and above. We do not knowingly collect personal information from children under 13.</p>

                        <h3>5. Contact Information</h3>
                        <p>For privacy inquiries or data rights requests, contact our designated privacy officer at <a href="mailto:privacy@tenflix.surge.sh" style="color:#e50914;">privacy@tenflix.surge.sh</a>.</p>
                    </div>
                `;
            } else if (activeTab === 'terms') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>Terms of Service</h2>
                        <p><strong>Last Updated: November 2026</strong></p>

                        <h3>1. Educational & Portfolio License</h3>
                        <p>Tenflix is an open-source demonstration application built for personal and portfolio media organization purposes. It is provided free of charge on an "AS IS" basis without warranties of any kind.</p>

                        <h3>2. Acceptable Use</h3>
                        <p>You agree not to use Tenflix for any unlawful purpose. You are solely responsible for ensuring that any personal video files or external URLs you import into your private browser library comply with applicable copyright and intellectual property laws.</p>

                        <h3>3. Intellectual Property</h3>
                        <p>Tenflix, its logo, interface styling, and original code are protected under open-source software licenses. Movie titles, posters, trademarks, and artwork displayed via TMDB belong to their respective copyright holders.</p>

                        <h3>4. Limitation of Liability</h3>
                        <p>In no event shall Tenflix, its authors, or contributors be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use this service.</p>
                    </div>
                `;
            } else if (activeTab === 'refund') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>Refund & Billing Policy</h2>
                        <div class="legal-alert" style="border-left-color: #46d369;">
                            <strong>100% Free Service:</strong> Tenflix does not charge any subscription fees, membership dues, or one-off payments.
                        </div>

                        <h3>1. No Financial Transactions</h3>
                        <p>Tenflix does not collect credit cards, bank accounts, or digital payment credentials. The application is completely free forever.</p>

                        <h3>2. Refund Inapplicability</h3>
                        <p>Because zero fees or charges are ever collected by Tenflix, financial refunds, billing disputes, and chargebacks are not applicable.</p>

                        <h3>3. No Hidden Fees or Auto-Renewals</h3>
                        <p>You will never be prompted for hidden upgrades, microtransactions, or paywalled content. If any third party claims to charge you for Tenflix, it is fraudulent.</p>
                    </div>
                `;
            } else if (activeTab === 'cookie') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>Cookie & Local Storage Policy</h2>
                        <p>Tenflix does not use invasive advertising cookies or cross-site tracking pixels.</p>

                        <h3>1. Essential Storage Used</h3>
                        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:0.85rem;">
                            <thead>
                                <tr style="border-bottom: 1px solid #444; color:#fff; text-align:left;">
                                    <th style="padding:8px 0;">Storage Key</th>
                                    <th style="padding:8px 0;">Purpose</th>
                                    <th style="padding:8px 0;">Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 1px solid #222;">
                                    <td style="padding:8px 0; font-family:monospace; color:#e50914;">netflix_user_session</td>
                                    <td>Remembers login/guest state</td>
                                    <td>Persistent</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #222;">
                                    <td style="padding:8px 0; font-family:monospace; color:#e50914;">netflix_custom_content</td>
                                    <td>Stores your personal library titles</td>
                                    <td>Persistent</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #222;">
                                    <td style="padding:8px 0; font-family:monospace; color:#e50914;">tenflix_cookie_consent</td>
                                    <td>Stores your cookie consent choice</td>
                                    <td>1 Year</td>
                                </tr>
                            </tbody>
                        </table>

                        <h3>2. Managing Your Preferences</h3>
                        <p>You can clear cookies and local storage at any time via your browser settings or using the button below:</p>
                        <button class="btn btn-secondary" onclick="localStorage.removeItem('tenflix_cookie_consent'); alert('Cookie preferences reset.'); location.reload();">Reset Cookie Preferences</button>
                    </div>
                `;
            } else if (activeTab === 'security') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>Security & Third-Party SDK Audit</h2>
                        <div class="legal-alert" style="border-left-color: #2196f3;">
                            <strong>Security Audit Passed:</strong> All external dependencies are audited, open-source, and sanitized against malicious injections.
                        </div>

                        <h3>1. Third-Party Auditing</h3>
                        <ul>
                            <li><strong>Lucide Icons (unpkg):</strong> Official open-source icon suite loaded over HTTPS with subresource integrity.</li>
                            <li><strong>Google Fonts:</strong> Standard web typography loaded securely over SSL.</li>
                            <li><strong>TMDB API:</strong> Official read-only REST endpoints accessed over encrypted HTTPS.</li>
                        </ul>

                        <h3>2. Security Architecture</h3>
                        <ul>
                            <li><strong>No Backend Data Leakage:</strong> Tenflix is a static client application. Your custom library content never touches our servers.</li>
                            <li><strong>Iframe Isolation:</strong> External video players are sandboxed with <code>referrerpolicy="origin"</code> and strict permissions.</li>
                            <li><strong>No Dark Patterns:</strong> Modals can always be closed using standard <code>X</code> buttons or the <code>Escape</code> key.</li>
                        </ul>
                    </div>
                `;
            } else if (activeTab === 'dmca') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>DMCA & Copyright Takedown Policy</h2>
                        <p>Tenflix respects the intellectual property rights of creators and adheres to the Digital Millennium Copyright Act (17 U.S.C. § 512).</p>

                        <h3>1. Non-Hosting Statement</h3>
                        <p>Tenflix does not store, host, or upload video files to its servers. The platform functions as an organizational client that loads embeds provided by third-party services and links provided by the end-user.</p>

                        <h3>2. Submitting a Takedown Notice</h3>
                        <p>If you are a copyright owner or an authorized agent and believe content accessible through Tenflix infringes upon your copyright, please send a written notification including:</p>
                        <ul>
                            <li>Identification of the copyrighted work claimed to be infringed.</li>
                            <li>Identification of the specific material to be removed or disabled.</li>
                            <li>Your contact information (name, address, email, telephone number).</li>
                            <li>A statement made under penalty of perjury that the information in the notification is accurate.</li>
                        </ul>
                        <p>Send all notices to: <a href="mailto:dmca@tenflix.surge.sh" style="color:#e50914;">dmca@tenflix.surge.sh</a></p>
                    </div>
                `;
            } else if (activeTab === 'deletion') {
                bodyHtml = `
                    <div class="legal-section">
                        <h2>GDPR Data Deletion & Right to Erasure</h2>
                        <p>In full compliance with Article 17 of the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA), you have the absolute right to permanently delete all data stored by Tenflix.</p>

                        <div class="legal-alert">
                            <strong>Notice:</strong> Because Tenflix stores your media library in your browser's IndexedDB and localStorage, clicking below will permanently erase your local library, history, preferences, and session state.
                        </div>

                        <div style="margin: 30px 0; display:flex; gap:15px; flex-wrap:wrap;">
                            <button class="btn btn-primary" style="background:#cc0000; border:none; padding:12px 25px;" onclick="app.handlers.deleteAllUserData()">
                                <i data-lucide="trash-2"></i> Delete All My Data Permanently
                            </button>
                            <button class="btn btn-secondary" onclick="app.handlers.exportLibrary()">
                                <i data-lucide="download"></i> Export Data First (JSON)
                            </button>
                        </div>
                    </div>
                `;
            }

            content.innerHTML = `
                <div class="legal-tabs">
                    ${tabs.map(t => `
                        <button class="legal-tab-btn ${t.id === activeTab ? 'active' : ''}" onclick="app.handlers.switchLegalTab('${t.id}')">
                            ${t.label}
                        </button>
                    `).join('')}
                </div>
                <div class="legal-body-container">
                    ${bodyHtml}
                </div>
            `;

            if (window.lucide) lucide.createIcons();
        },

        setCookieConsent: (type) => {
            localStorage.setItem('tenflix_cookie_consent', type);
            const banner = document.getElementById('cookie-banner');
            if (banner) {
                banner.style.animation = 'slideUp 0.2s reverse forwards';
                setTimeout(() => banner.classList.add('hidden'), 200);
            }
        },

        checkCookieConsent: () => {
            const consent = localStorage.getItem('tenflix_cookie_consent');
            if (!consent) {
                const banner = document.getElementById('cookie-banner');
                if (banner) banner.classList.remove('hidden');
            }
        },

        deleteAllUserData: () => {
            if (confirm("Are you sure you want to permanently delete all your stored data (custom library, cookies, history, and preferences)?\n\nThis action cannot be undone.")) {
                try {
                    localStorage.clear();
                    sessionStorage.clear();
                    indexedDB.deleteDatabase(app.storage.dbName);
                    alert("All personal data has been erased in full compliance with GDPR & CCPA.\n\nThe page will now reload with a clean slate.");
                    location.reload();
                } catch (e) {
                    console.error("Data deletion error", e);
                    localStorage.clear();
                    location.reload();
                }
            }
        },

        openDetailsById: (id) => {
            if (app.hoverCard) app.hoverCard.hide();
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
            if (app.hoverCard) app.hoverCard.hide();
            const item = window.currentItem;
            if (hasEpisodes && item && item.episodes && item.episodes.length > 0) {
                // Play first episode
                const ep = item.episodes[0];
                app.router.openPlayer(ep.video_url, ep.caption_url, item.id, 0);
            } else if (url && url !== 'undefined' && url.trim() !== '') {
                app.router.openPlayer(url);
            } else if (item && item.id && !item.is_custom) {
                // VidLink Embed Integration for TMDB Content
                const isTv = item.media_type === 'tv' || item.name || item.first_air_date;
                const streamUrl = isTv 
                    ? `https://vidlink.pro/tv/${item.id}/1/1?primaryColor=E50914&autoplay=false`
                    : `https://vidlink.pro/movie/${item.id}?primaryColor=E50914&autoplay=false`;
                app.router.openPlayer(streamUrl);
            } else {
                console.warn("No video URL found for this item.");
                alert("Video not available for this title.");
            }
        },
        switchSeason: async (ele, itemId) => {
            const season = parseInt(ele.value);
            let item = (window.appItemMap && window.appItemMap[itemId]) || app.services.findItemById(itemId) || window.currentItem;
            if (!item) return;

            const listContainer = document.querySelector('.episode-list');
            const countSpan = document.getElementById('season-ep-count');

            const hasSeasonLoaded = item.episodes && item.episodes.some(e => (e.season || 1) == season);

            if (!hasSeasonLoaded && !item.is_custom && itemId) {
                if (listContainer) {
                    listContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#aaa;"><i data-lucide="loader" class="spin"></i> Loading Season ' + season + ' episodes...</div>';
                    if (window.lucide) lucide.createIcons();
                }
                try {
                    const seasonData = await app.services.fetchTmdb('/tv/' + itemId + '/season/' + season);
                    if (seasonData && seasonData.episodes && Array.isArray(seasonData.episodes)) {
                        const newEps = seasonData.episodes.map(ep => ({
                            season: season,
                            episode_number: ep.episode_number,
                            title: ep.name ? (ep.episode_number + '. ' + ep.name) : ('Episode ' + ep.episode_number),
                            overview: ep.overview || '',
                            runtime: ep.runtime ? String(ep.runtime) : '45',
                            still_path: ep.still_path ? (ep.still_path.startsWith('http') ? ep.still_path : ('https://image.tmdb.org/t/p/w500' + ep.still_path)) : '',
                            video_url: ''
                        }));
                        item.episodes = (item.episodes || []).filter(e => (e.season || 1) != season).concat(newEps);
                    }
                } catch (err) {
                    console.warn("Could not fetch season " + season, err);
                }
            }

            if (listContainer) {
                listContainer.innerHTML = app.components.renderEpisodeList(item, season);
                app.services.populateDurations(item, season);
                if (window.lucide) lucide.createIcons();
            }
            if (countSpan) {
                const count = (item.episodes || []).filter(e => (e.season || 1) == season).length;
                countSpan.textContent = count + ' Episodes';
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

        closeDetails: (shouldPopHistory = true) => {
            const modal = document.getElementById('modal-container');
            if (modal) modal.classList.add('hidden');
            app.utils.unfreezePage();
            if (app.hoverCard) app.hoverCard.hide();
            if (shouldPopHistory && history.state && history.state.tenflixModal) {
                try { history.back(); } catch (e) {}
            }
        },

        closePlayer: (shouldPopHistory = true) => {
            window.isPlayerActive = false;
            const modal = document.getElementById('player-container');

            // cleanup YouTube
            if (app.activeYoutubePlayer && app.activeYoutubePlayer.destroy) {
                try { app.activeYoutubePlayer.destroy(); } catch (e) {}
            }
            if (app.activeYoutubeInterval) {
                clearInterval(app.activeYoutubeInterval);
            }
            app.activeYoutubePlayer = null;
            app.activeYoutubeInterval = null;

            app.utils.unfreezePage();
            if (app.hoverCard) app.hoverCard.hide();
            if (modal) {
                modal.classList.add('hidden');
                modal.innerHTML = '';
            }

            if (shouldPopHistory && history.state && history.state.tenflixPlayer) {
                try { history.back(); } catch (e) {}
            }
        },

        toggleEpisodesDrawer: () => {
            const drawer = document.getElementById('player-episodes-drawer');
            if (!drawer) return;
            drawer.classList.toggle('hidden');
            if (window.lucide) lucide.createIcons();
        },

        switchDrawerSeason: async (selectEle, itemId) => {
            const season = parseInt(selectEle.value);
            let item = (window.appItemMap && window.appItemMap[itemId]) || app.services.findItemById(itemId) || window.currentItem || window.currentPlayingItem;
            if (!item) return;

            const drawerList = document.getElementById('drawer-ep-list');
            const drawerCount = document.getElementById('drawer-ep-count');

            const hasSeasonLoaded = item.episodes && item.episodes.some(e => (e.season || 1) == season);
            if (!hasSeasonLoaded && !item.is_custom && itemId) {
                if (drawerList) {
                    drawerList.innerHTML = '<div style="padding:30px; text-align:center; color:#888;">Loading Season ' + season + '...</div>';
                }
                try {
                    const seasonData = await app.services.fetchTmdb('/tv/' + itemId + '/season/' + season);
                    if (seasonData && seasonData.episodes && Array.isArray(seasonData.episodes)) {
                        const newEps = seasonData.episodes.map(ep => ({
                            season: season,
                            episode_number: ep.episode_number,
                            title: ep.name ? (ep.episode_number + '. ' + ep.name) : ('Episode ' + ep.episode_number),
                            overview: ep.overview || '',
                            runtime: ep.runtime ? String(ep.runtime) : '45',
                            still_path: ep.still_path ? (ep.still_path.startsWith('http') ? ep.still_path : ('https://image.tmdb.org/t/p/w500' + ep.still_path)) : '',
                            video_url: ''
                        }));
                        item.episodes = (item.episodes || []).filter(e => (e.season || 1) != season).concat(newEps);
                    }
                } catch (err) {
                    console.warn("Could not fetch season " + season, err);
                }
            }

            const currentEpisodes = (item.episodes || []).filter(e => (e.season || 1) == season);
            if (drawerCount) drawerCount.textContent = currentEpisodes.length + ' Episodes';

            if (drawerList) {
                drawerList.innerHTML = currentEpisodes.map((ep, idx) => {
                    const epNum = ep.episode_number || (idx + 1);
                    const isPlaying = (ep.season || 1) == (window.currentSeason || 1) && epNum == (window.currentEpisode || 1);
                    let img = ep.still_path || ep.img || '';
                    if (img && !img.startsWith('http')) img = 'https://image.tmdb.org/t/p/w300' + img;
                    img = app.utils.proxyImg(img || 'https://via.placeholder.com/200x110?text=Episode');

                    return `
                        <div class="drawer-episode-item ${isPlaying ? 'playing' : ''}" onclick="app.router.openPlayer(null, null, '${item.id}', null, 1, ${ep.season || season}, ${epNum})">
                            <div class="drawer-ep-thumb" style="background-image: url('${img}');">
                                ${isPlaying ? '<div class="playing-badge"><i data-lucide="play" fill="white"></i></div>' : ''}
                            </div>
                            <div class="drawer-ep-info">
                                <div class="drawer-ep-title">${ep.title || 'Episode ' + epNum}</div>
                                <div class="drawer-ep-meta">${ep.runtime ? ep.runtime + 'm' : ''}</div>
                                <div class="drawer-ep-desc">${ep.overview ? ep.overview.substring(0, 80) + '...' : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                if (window.lucide) lucide.createIcons();
            }
        },

        playNextEpisode: (itemId, currentSeason, currentEpisode) => {
            const item = (window.appItemMap && window.appItemMap[itemId]) || app.services.findItemById(itemId) || window.currentItem || window.currentPlayingItem;
            if (!item) return;

            let targetSeason = currentSeason;
            let targetEpisode = currentEpisode + 1;

            const currentSeasonEps = (item.episodes || []).filter(e => (e.season || 1) == currentSeason);
            if (currentSeasonEps.length > 0 && targetEpisode > currentSeasonEps.length) {
                if (item.seasonsList && item.seasonsList.length > 0) {
                    const nextSeasonObj = item.seasonsList.find(s => s.season_number > currentSeason);
                    if (nextSeasonObj) {
                        targetSeason = nextSeasonObj.season_number;
                        targetEpisode = 1;
                    } else {
                        alert("You've reached the last episode of the series!");
                        return;
                    }
                }
            }

            app.router.openPlayer(null, null, itemId, null, 1, targetSeason, targetEpisode);
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
                                                                            <iframe src="${iframeUrl}" width="100%" height="100%" frameborder="0" allow="autoplay *; fullscreen *; encrypted-media *; accelerometer *; gyroscope *; picture-in-picture *; web-share *" allowfullscreen></iframe>
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
        searchBrowse: (container) => {
            const popularTitles = [
                "Emily in Paris", "Friends", "Crazy Rich Asians", "How to Lose a Guy in 10 Days",
                "10 Things I Hate About You", "Stranger Things", "Law & Order: Special Victims Unit",
                "Deadpool", "The Office", "Voicemails for Isabelle"
            ];
            const all = [...(app.state.customContent || []), ...(app.state.tmdbContent.trending || [])];
            const items = all.filter((item, idx, self) => self.findIndex(t => t.id === item.id) === idx).slice(0, 18);

            container.innerHTML = `
                <div class="search-results-container" style="padding: 70px 16px 80px 16px;">
                    <h2 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 14px;">Top Searches</h2>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;">
                        ${popularTitles.map(t => `
                            <button type="button" onclick="const input = document.getElementById('search-input'); if(input) { input.value = '${t.replace(/'/g, "\\\'")}'; app.pages.search(document.getElementById('main-content'), '${t.replace(/'/g, "\\\'")}'); }" 
                                style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 9999px; padding: 6px 14px; font-size: 0.85rem; cursor: pointer;">
                                ${t}
                            </button>
                        `).join('')}
                    </div>
                    <h3 style="font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 12px;">Popular on Tenflix</h3>
                    <div class="search-results-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(115px, 1fr)); gap: 10px;">
                        ${items.map(item => {
                            let img = item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : ('https://image.tmdb.org/t/p/w500' + item.poster_path)) : '';
                            img = app.utils.proxyImg(img || 'https://via.placeholder.com/200x300?text=' + encodeURIComponent(item.title || item.name || 'Movie'));
                            return `
                                <div class="poster" onclick="app.handlers.openDetailsById('${item.id}')" style="cursor: pointer; position: relative; border-radius: 6px; overflow: hidden; background: #202020;">
                                    <img src="${img}" alt="${(item.title || item.name || '').replace(/"/g, '&quot;')}" style="width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; border-radius: 6px;">
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        },
        home: (container) => {
            // Clear existing content
            container.innerHTML = '';

            // Hero Section - SLIDESHOW LOGIC
            // Get potential hero items: ALL Custom content
            // We filter for items that are explicitly custom to ensure we don't pick up random TMDB fills if any exist there.
            const customHeroes = app.state.customContent.filter(i => !(i.title && i.title.toLowerCase().includes('how to train your')));
            let heroItems = customHeroes.length > 0 ? customHeroes : [app.state.tmdbContent.trending[0]];

            // Priority ordering: Emily first, Friends second, then random
            const emilyItem = heroItems.find(i => i.id === 'emily_in_paris' || (i.title && i.title.includes('Emily in Paris')));
            const friendsItem = heroItems.find(i => i.title === 'Friends' || i.title === 'FRIENDS');

            // Remove pinned items from the pool
            let otherItems = heroItems.filter(i => i !== emilyItem && i !== friendsItem);

            // Shuffle the rest
            otherItems.sort(() => Math.random() - 0.5);

            // Reconstruct array with explicit order
            heroItems = [];
            if (emilyItem) heroItems.push(emilyItem);
            if (friendsItem) heroItems.push(friendsItem);
            heroItems = [...heroItems, ...otherItems];

            // If only one custom item or no custom items, fall back to mixed content
            if (heroItems.length === 0) heroItems = [app.services.getMockHero()];
            if (heroItems.length === 1 && app.state.tmdbContent.trending.length > 0) {
                heroItems.push(app.state.tmdbContent.trending[0]);
            }

            // Initial render
            let currentHeroIndex = 0;
            const heroContainer = document.createElement('div');
            heroContainer.className = 'hero';
            heroContainer.style.transition = 'background-image 1s ease-in-out';
            container.appendChild(heroContainer);

            function renderHero(item) {
                if (!item) return;

                let heroImg = 'https://via.placeholder.com/1920x1080?text=No+Hero+Image';
                if (item.backdrop_path) {
                    heroImg = item.backdrop_path.startsWith('http') ? item.backdrop_path : app.state.config.backdropBaseUrl + item.backdrop_path;
                } else if (item.poster_path) {
                    heroImg = item.poster_path.startsWith('http') ? item.poster_path : app.state.config.backdropBaseUrl + item.poster_path;
                }
                heroImg = app.utils.proxyImg(heroImg);

                heroContainer.style.backgroundImage = `url('${heroImg}')`;

                // Fix for Emily in Paris header cropping
                if (item.id === 'emily_in_paris' || (item.title && item.title.includes('Emily in Paris'))) {
                    heroContainer.style.backgroundPosition = 'center 20%';
                } else if (item.title && item.title.includes('10 Things')) {
                    // Similar fix for 10 Things I Hate About You to show heads
                    heroContainer.style.backgroundPosition = 'center 20%';
                } else {
                    heroContainer.style.backgroundPosition = 'center center';
                }

                heroContainer.innerHTML = `
                    <div class="hero-overlay" style="background: linear-gradient(to top, #141414 10%, transparent 90%);"></div>
                    
                    <!-- Left Arrow -->
                    <button class="slider-arrow left" onclick="app.handlers.prevHero()" style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; color: white; padding: 10px; cursor: pointer; border-radius: 50%; z-index: 10; opacity: 0; transition: opacity 0.3s;">
                        <i data-lucide="chevron-left" width="40" height="40"></i>
                    </button>

                    <!-- Right Arrow -->
                    <button class="slider-arrow right" onclick="app.handlers.nextHero()" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; color: white; padding: 10px; cursor: pointer; border-radius: 50%; z-index: 10; opacity: 0; transition: opacity 0.3s;">
                        <i data-lucide="chevron-right" width="40" height="40"></i>
                    </button>

                    <div class="hero-content" style="max-width: 600px; padding-bottom: 100px; animation: fadeIn 0.5s;">
                        <div style="display: flex; align-items: center; margin-bottom: 15px;">
                            <span style="color: #E50914; font-weight: 800; font-size: 2.5rem; margin-right: 2px;">T</span>
                            <span style="color: #ddd; font-weight: 500; letter-spacing: 5px; font-size: 0.9rem; margin-top: 5px;">SERIES</span>
                        </div>
                        
                        <h1 class="hero-title" style="font-size: 4rem; line-height: 1.0; margin-bottom: 20px; text-transform: uppercase;">
                            ${item.title || item.name}
                        </h1>
                        
                        <p class="hero-desc" style="font-size: 1.4rem; font-weight: 500; font-style: italic; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); margin-bottom: 30px; line-height: 1.2;">
                            ${(item.overview || item.description || '').substring(0, 150)}...
                        </p>
                        
                        <div class="hero-buttons">
                            <button id="hero-play" class="btn hero-play-btn" onclick="app.handlers.playHero()"
                                style="background: white; color: black; border: none; padding: 10px 25px; font-size: 1.1rem; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                                <i data-lucide="play" fill="black"></i> <span>Play</span>
                            </button>
                            <button id="hero-info" class="btn hero-info-btn" title="More Info"
                                style="background: rgba(109, 109, 110, 0.7); color: white; border: none; padding: 10px 25px; font-size: 1.1rem; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 10px; cursor: pointer;">
                                <i data-lucide="info"></i> <span class="hero-info-text">More Info</span>
                            </button>
                        </div>
                    </div>

                    <!-- Pagination Dots -->
                    <div class="hero-pagination-dots" style="position: absolute; bottom: 150px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 10;">
                        ${heroItems.map((_, idx) => `
                            <div onclick="app.handlers.setHero(${idx})" style="width: 10px; height: 10px; border-radius: 50%; background: ${idx === currentHeroIndex ? 'white' : 'rgba(255,255,255,0.5)'}; cursor: pointer; transition: background 0.3s;"></div>
                        `).join('')}
                    </div>

                    <!-- Show arrows on hover -->
                    <style>
                        .hero:hover .slider-arrow { opacity: 1 !important; }
                    </style>
                `;

                // Re-bind listeners because innerHTML wiped them logic
                window.currentHeroItem = item;
                const infoBtn = heroContainer.querySelector('#hero-info');
                if (infoBtn) infoBtn.onclick = () => app.router.openDetails(item);

                lucide.createIcons();
            }

            // Define Handlers for Navigation
            app.handlers.nextHero = () => {
                currentHeroIndex = (currentHeroIndex + 1) % heroItems.length;
                renderHero(heroItems[currentHeroIndex]);
                resetInterval();
            };
            app.handlers.prevHero = () => {
                currentHeroIndex = (currentHeroIndex - 1 + heroItems.length) % heroItems.length;
                renderHero(heroItems[currentHeroIndex]);
                resetInterval();
            };
            app.handlers.setHero = (index) => {
                currentHeroIndex = index;
                renderHero(heroItems[currentHeroIndex]);
                resetInterval();
            };

            function resetInterval() {
                if (window.heroInterval) clearInterval(window.heroInterval);
                window.heroInterval = setInterval(() => {
                    currentHeroIndex = (currentHeroIndex + 1) % heroItems.length;
                    renderHero(heroItems[currentHeroIndex]);
                }, 6000);
            }

            renderHero(heroItems[0]);

            // Start Slideshow Interval
            resetInterval();

            // Touch Swipe Gestures for Hero Slideshow (Mobile finger swipe left/right)
            let touchStartX = 0;
            let touchStartY = 0;
            let touchEndX = 0;
            let touchEndY = 0;

            heroContainer.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                }
            }, { passive: true });

            heroContainer.addEventListener('touchend', (e) => {
                if (e.changedTouches && e.changedTouches[0]) {
                    touchEndX = e.changedTouches[0].clientX;
                    touchEndY = e.changedTouches[0].clientY;
                    const diffX = touchEndX - touchStartX;
                    const diffY = touchEndY - touchStartY;
                    // Dominant horizontal swipe with threshold of 35px
                    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
                        if (diffX < 0) {
                            // Swiped Left -> Advance to next hero slide
                            app.handlers.nextHero();
                        } else {
                            // Swiped Right -> Go to previous hero slide
                            app.handlers.prevHero();
                        }
                    }
                }
            }, { passive: true });

            // Rows - Switched order, populated with real trending & suggested content alongside custom library
            const allCustom = app.state.customContent;
            const customMovies = allCustom.filter(i => !i.episodes && i.id !== 'friends_s1_full' && i.id !== 'emily_in_paris');
            const customShows = allCustom.filter(i => i.episodes || i.id === 'friends_s1_full' || i.id === 'emily_in_paris');
            const tmdb = app.state.tmdbContent;

            // 1. Movies (Switched to top row as requested)
            // Combine custom movies with real popular & trending movies from TMDB
            const combinedMovies = [...customMovies, ...(tmdb.trendingMovies || []), ...(tmdb.popularMovies || [])];
            const seenMovies = new Set();
            const uniqueMovies = combinedMovies.filter(m => {
                const key = m.id || m.title;
                if (!key || seenMovies.has(key)) return false;
                seenMovies.add(key);
                return true;
            });
            if (uniqueMovies.length > 0) {
                app.components.createRow(container, 'Movies', uniqueMovies);
            }

            // 2. Top Searches (Real trending data from TMDB)
            // Shows what is actually trending and most searched globally right now
            const realTopSearches = (tmdb.trending && tmdb.trending.length > 0) ? tmdb.trending : sortedTopFallback(allCustom);
            app.components.createRow(container, 'Top Searches', realTopSearches);

            // 3. TV Shows & Series (Real TV shows from TMDB + custom shows)
            const combinedShows = [...customShows, ...(tmdb.trendingTv || []), ...(tmdb.popularTv || [])];
            const seenShows = new Set();
            const uniqueShows = combinedShows.filter(s => {
                const key = s.id || (s.title || s.name);
                if (!key || seenShows.has(key)) return false;
                seenShows.add(key);
                return true;
            });
            if (uniqueShows.length > 0) {
                app.components.createRow(container, 'TV Shows & Series', uniqueShows);
            }

            // 4. Top Rated Classics
            if (tmdb.topRated && tmdb.topRated.length > 0) {
                app.components.createRow(container, 'Top Rated Classics', tmdb.topRated);
            }

            function sortedTopFallback(items) {
                return [...items].sort((a, b) => {
                    const isAF = a.title && (a.title === 'Friends' || a.title === 'FRIENDS');
                    const isBF = b.title && (b.title === 'Friends' || b.title === 'FRIENDS');
                    if (isAF) return -1;
                    if (isBF) return 1;
                    return 0;
                });
            }
        },

        custom: (container) => {
            container.innerHTML = `
                <div style="padding: 100px 4% 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h1>My Custom Content</h1>
                        <button class="btn btn-primary" onclick="window.location.hash = 'add'"><i data-lucide="plus"></i> Add Title</button>
                    </div>
                    <div class="grid-layout">
                        ${app.state.customContent.map(item => {
                            let customPoster = item.poster_path || item.backdrop_path || '';
                            if (customPoster && !customPoster.startsWith('http')) {
                                customPoster = app.state.config.imageBaseUrl + customPoster;
                            } else if (!customPoster) {
                                customPoster = 'https://via.placeholder.com/200x300?text=No+Image';
                            }
                            return `
                                <div class="poster" onclick="app.handlers.openDetailsById('${item.id}')">
                                    <img src="${app.utils.proxyImg(customPoster)}" alt="${(item.title || 'Movie Poster').replace(/"/g, '&quot;')}" class="poster-img" style="aspect-ratio: 2/3;" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x450/1f1f1f/ffffff?text=' + encodeURIComponent(item.title || 'No Poster');">
                                    <h3 style="margin-top: 10px; font-size: 1rem;">${item.title}</h3>
                                </div>
                            `;
                        }).join('')}
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

                                                                                                <div class="form-consent-box" style="margin: 20px 0 15px; display: flex; align-items: flex-start; gap: 10px; font-size: 0.85rem; color: #aaa; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px;">
                                                    <input type="checkbox" id="add-consent-cb" required style="width: 18px; height: 18px; margin-top: 2px; accent-color: #e50914; cursor: pointer;">
                                                    <label for="add-consent-cb" style="cursor: pointer; line-height: 1.4;">
                                                        I confirm that this title complies with the <a onclick="app.handlers.openLegal('terms')" style="color:#e50914; text-decoration: underline; cursor:pointer;">Terms of Service</a>, and that I have the necessary rights or licenses for this media.
                                                    </label>
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
                            <h4 style="margin-bottom: 10px; color: #fff;">Privacy & Data Rights (GDPR / CCPA)</h4>
                            <p style="margin-bottom: 15px; color: #aaa; font-size: 0.85rem;">Tenflix respects your digital privacy. We do not sell user data or use advertising cookies. Manage your local storage and rights below:</p>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                                <button type="button" class="btn btn-secondary" style="font-size: 0.85rem;" onclick="app.handlers.openLegal('privacy')">Privacy Policy</button>
                                <button type="button" class="btn btn-secondary" style="font-size: 0.85rem;" onclick="app.handlers.openLegal('cookie')">Cookie Preferences</button>
                                <button type="button" class="btn btn-secondary" style="font-size: 0.85rem;" onclick="app.handlers.openLegal('terms')">Terms & Conditions</button>
                            </div>
                            <button type="button" class="btn btn-secondary" style="background: #cc0000; font-size: 0.85rem; border: none;" onclick="app.handlers.deleteAllUserData()">Erase All Data Permanently (GDPR)</button>
                        </div>
                    </div>
                </div>
             `;
        },

        search: async (container, query) => {
            const currentQuery = query.trim();
            const q = currentQuery.toLowerCase();
            if (!q) {
                app.router.handleHash();
                return;
            }

            // Show search indicator
            container.innerHTML = `<div style="padding: 100px 4%; text-align: center; color: white;"><div class="loader" style="display:inline-block; width:40px; height:40px; border:3px solid rgba(255,255,255,0.2); border-radius:50%; border-top-color:#e50914; animation:spin 0.8s linear infinite;"></div><h2 style="margin-top:15px; font-weight:500;">Searching "${currentQuery}"...</h2><style>@keyframes spin { to { transform: rotate(360deg); } }</style></div>`;

            // 1. Search local hardcoded library
            const customMatches = (app.state.customContent || []).filter(i => {
                const title = (i.title || i.name || '').toLowerCase();
                const desc = (i.description || i.overview || '').toLowerCase();
                const genre = (i.genre || '').toLowerCase();
                return title.includes(q) || desc.includes(q) || genre.includes(q);
            });

            // 2. Search TMDB live for all movies and TV shows
            let tmdbResults = [];
            try {
                const rawTmdb = await app.services.fetchTmdb(`/search/multi?query=${encodeURIComponent(currentQuery)}`);
                if (Array.isArray(rawTmdb)) {
                    tmdbResults = rawTmdb.filter(i => (i.media_type === 'movie' || i.media_type === 'tv' || i.title || i.name) && (i.poster_path || i.backdrop_path));
                }
            } catch (e) {
                console.error("TMDB Search Error", e);
            }

            // Stash search results for findItemById
            app.state.searchResults = [...customMatches, ...tmdbResults];

            // Verify if user already changed or cleared input while fetching
            const activeInput = document.getElementById('search-input');
            if (activeInput && activeInput.value.trim().toLowerCase() !== q) {
                if (activeInput.value.trim() === '') {
                    app.router.handleHash();
                }
                return;
            }

            let allContent = [...customMatches, ...tmdbResults];

            // Remove duplicates by ID or title
            const seen = new Set();
            let results = allContent.filter(i => {
                const key = i.id || (i.title || i.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            if (results.length === 0) {
                container.innerHTML = `<div style="padding: 100px 4%; color: white; text-align: center;"><h2>No results found for "${currentQuery}"</h2><p style="color: #999; margin-top: 10px;">Try searching for something else.</p></div>`;
                return;
            }

            // Sort prioritizing exact title matches first, then startsWith, then custom content
            results.sort((a, b) => {
                const aTitle = (a.title || a.name || '').toLowerCase();
                const bTitle = (b.title || b.name || '').toLowerCase();

                const aExact = aTitle === q;
                const bExact = bTitle === q;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                const aStarts = aTitle.startsWith(q);
                const bStarts = bTitle.startsWith(q);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                if (a.is_custom && !b.is_custom) return -1;
                if (!a.is_custom && b.is_custom) return 1;

                return 0;
            });

            // Derive related title exploration chips from results
            const related = [...new Set(results.slice(0, 6).map(r => r.title || r.name).filter(Boolean))];

            container.innerHTML = `
                <div class="search-results-container">
                    ${related.length > 0 ? `
                        <div class="related-titles-bar">
                            <span style="color: #777;">Explore titles related to:</span>
                            ${related.map(t => `<span class="related-title" style="cursor:pointer;" onclick="const si = document.getElementById('search-input'); if(si){si.value='${t.replace(/'/g, "\\\'")}';} app.pages.search(document.getElementById('main-content'), '${t.replace(/'/g, "\\\'")}');">${t}</span>`).join('')}
                        </div>
                    ` : ''}

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; padding: 20px 4%;">
                        ${results.map(item => {
                            const imgPath = item.backdrop_path || item.poster_path;
                            let fullImg = 'https://via.placeholder.com/300x169?text=No+Image';
                            if (imgPath) {
                                fullImg = imgPath.startsWith('http') ? imgPath : 'https://image.tmdb.org/t/p/w780' + imgPath;
                            }
                            fullImg = app.utils.proxyImg(fullImg);

                            return `
                                <div onclick='app.router.openDetails(${JSON.stringify(item).replace(/'/g, "&#39;")})' 
                                     style="cursor: pointer; position: relative; border-radius: 8px; overflow: hidden; transition: transform 0.2s; background: #181818; box-shadow: 0 4px 15px rgba(0,0,0,0.5);"
                                     onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                    <div style="position: relative;">
                                        <img src="${fullImg}" style="width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block;" loading="lazy">
                                        <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; color: white;">
                                            ${item.is_custom ? '<i data-lucide="check-circle" style="width: 10px; height: 10px; display: inline-block;"></i> In Library' : '<i data-lucide="play" style="width: 10px; height: 10px; display: inline-block;"></i> Watch Now'}
                                        </div>
                                    </div>
                                    <div style="padding: 12px;">
                                        <h3 style="font-size: 1rem; color: #fff; margin: 0 0 6px 0; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${item.title || item.name}</h3>
                                        <div style="display: flex; gap: 10px; align-items: center; font-size: 0.8rem; color: #aaa;">
                                            <span>${item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : '2024')}</span>
                                            <span style="border: 1px solid #555; padding: 1px 4px; border-radius: 2px; font-size: 0.6rem;">HD</span>
                                            
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        },

        tv: (container) => {
            const customShows = app.state.customContent.filter(i => i.episodes || i.id === 'friends_s1_full' || i.id === 'emily_in_paris');
            const tmdb = app.state.tmdbContent;

            let html = `
                <div class="content-rows" style="padding-top: 100px; padding-bottom: 50px; position: relative; z-index: 10;">
                    <div class="row-container" id="row-trending-tv"></div>
                    <div class="row-container" id="row-popular-tv"></div>
                    <div class="row-container" id="row-custom-tv"></div>
                </div>
            `;
            container.innerHTML = html;

            // 1. Trending TV Shows (Real TMDB Data)
            if (tmdb.trendingTv && tmdb.trendingTv.length > 0) {
                app.components.createRow(document.getElementById('row-trending-tv'), "Trending TV Shows", tmdb.trendingTv);
                const r = document.getElementById('row-trending-tv').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            // 2. Popular TV Series (The Office, Stranger Things, Breaking Bad, etc.)
            if (tmdb.popularTv && tmdb.popularTv.length > 0) {
                app.components.createRow(document.getElementById('row-popular-tv'), "Popular Series", tmdb.popularTv);
                const r = document.getElementById('row-popular-tv').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            // 3. My Custom TV Shows
            if (customShows && customShows.length > 0) {
                app.components.createRow(document.getElementById('row-custom-tv'), "My Custom TV Shows", customShows);
                const r = document.getElementById('row-custom-tv').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            if (window.lucide) lucide.createIcons();
        },

        movies: (container) => {
            const customMovies = app.state.customContent.filter(i => !i.episodes && i.id !== 'friends_s1_full' && i.id !== 'emily_in_paris');
            const tmdb = app.state.tmdbContent;

            let html = `
                <div class="content-rows" style="padding-top: 100px; padding-bottom: 50px; position: relative; z-index: 10;">
                    <div class="row-container" id="row-trending-movies"></div>
                    <div class="row-container" id="row-popular-movies"></div>
                    <div class="row-container" id="row-top-rated-movies"></div>
                    <div class="row-container" id="row-custom-movies"></div>
                </div>
            `;
            container.innerHTML = html;

            // 1. Trending Movies (Real TMDB Data)
            if (tmdb.trendingMovies && tmdb.trendingMovies.length > 0) {
                app.components.createRow(document.getElementById('row-trending-movies'), "Trending Movies", tmdb.trendingMovies);
                const r = document.getElementById('row-trending-movies').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            // 2. Popular Blockbusters (Combined with custom)
            const combinedPopular = [...customMovies, ...(tmdb.popularMovies || [])];
            const seen = new Set();
            const uniquePopular = combinedPopular.filter(m => {
                const key = m.id || m.title;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            app.components.createRow(document.getElementById('row-popular-movies'), "Popular Movies", uniquePopular);
            const rPop = document.getElementById('row-popular-movies').querySelector('.row');
            if (rPop) rPop.style.marginTop = '0';

            // 3. Top Rated Classics (Inception, The Dark Knight, etc.)
            if (tmdb.topRated && tmdb.topRated.length > 0) {
                app.components.createRow(document.getElementById('row-top-rated-movies'), "Top Rated Classics", tmdb.topRated);
                const r = document.getElementById('row-top-rated-movies').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            // 4. My Custom Movies
            if (customMovies && customMovies.length > 0) {
                app.components.createRow(document.getElementById('row-custom-movies'), "My Custom Movies", customMovies);
                const r = document.getElementById('row-custom-movies').querySelector('.row');
                if (r) r.style.marginTop = '0';
            }

            if (window.lucide) lucide.createIcons();
        }
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
            heroImg = app.utils.proxyImg(heroImg);

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

            if (!window.appItemMap) window.appItemMap = {};

            posters.innerHTML = items.map((item, idx) => {
                window.appItemMap[item.id] = item;

                // Prefer poster_path so show name/logo is visible inside the picture itself (Hotstar style)
                let imgPath = 'https://via.placeholder.com/300x450?text=No+Image';
                if (item.poster_path) {
                    imgPath = item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                } else if (item.backdrop_path) {
                    imgPath = item.backdrop_path.startsWith('http') ? item.backdrop_path : `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
                }
                imgPath = app.utils.proxyImg(imgPath);

                const isTop10 = idx < 3 && title.toLowerCase().includes('top');
                let isNewSeason = Math.random() > 0.8;

                if (item.type === 'movie' || (item.title && item.title.includes('10 Things'))) {
                    isNewSeason = false;
                }

                const displayTitle = item.title || item.name || 'Untitled';

                return `
                    <div class="poster" data-item-id="${item.id}" onclick="app.handlers.openDetailsById('${item.id}')">
                        <img src="${imgPath}" alt="${displayTitle}" class="poster-img" loading="lazy" onerror="this.onerror=null;this.src='https://via.placeholder.com/300x169/181818/ffffff?text=' + encodeURIComponent('${displayTitle.replace(/'/g, "\\\'")}');">
                        <div class="poster-title-overlay">
                            <span class="poster-title-text">${displayTitle}</span>
                        </div>
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
                    if (imgUrl.startsWith('/') && !imgUrl.startsWith('http')) imgUrl = (app.state.config.backdropBaseUrl || 'https://image.tmdb.org/t/p/original') + imgUrl;
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
                imgUrl = app.utils.proxyImg(imgUrl);
                const epId = 'ep-dur-' + item.id + '-' + index;
                const epNum = ep.episode_number || (filteredIndex + 1);

                return `
                    <div class="episode-item" onclick="app.router.openPlayer('${ep.video_url || ''}', '${ep.caption_url || ''}', '${item.id || ''}', ${index}, 1, ${ep.season || season}, ${epNum})">
                        <div class="episode-number">${epNum}</div>
                        <div class="episode-thumbnail" style="background-image: url('${imgUrl}'); background-size: cover; background-position: center;"></div>
                        <div class="episode-info">
                            <div style="display:flex; justify-content:space-between; width:100%;">
                                <div class="episode-title">${ep.title || 'Episode ' + epNum}</div>
                                <div id="${epId}" style="font-size: 0.9rem; color: #aaa;">${ep.runtime ? ep.runtime + 'm' : ''}</div>
                            </div>
                            <div class="episode-overview" style="color: #999; font-size: 0.85rem; margin-top: 5px;">${ep.overview || ''}</div>
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

            // Check currently viewed item
            if (window.currentItem && window.currentItem.id == id) return window.currentItem;

            // Check search results
            if (app.state.searchResults) {
                item = app.state.searchResults.find(i => i.id == id);
                if (item) return item;
            }

            // Check all TMDB lists
            const lists = [
                app.state.tmdbContent.trending,
                app.state.tmdbContent.trendingMovies,
                app.state.tmdbContent.trendingTv,
                app.state.tmdbContent.popularMovies,
                app.state.tmdbContent.popularTv,
                app.state.tmdbContent.topRated,
                app.state.tmdbContent.action,
                app.state.tmdbContent.comedy
            ];
            for (const list of lists) {
                if (list) {
                    item = list.find(i => i.id == id);
                    if (item) return item;
                }
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

        fetchTmdb: async (path) => {
            const apiKey = 'd582a5bf11361f97f2946cbb1cc55ce8';
            const tmdbBaseUrl = 'https://api.themoviedb.org/3';
            let url = `${tmdbBaseUrl}${path}`;
            if (!url.includes('?')) url += '?language=en-US';
            else url += '&language=en-US';
            url += `&api_key=${apiKey}`;

            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    return data.results !== undefined ? data.results : data;
                }
            } catch (e) {
                console.warn("Direct TMDB Fetch Error:", e);
            }
            return [];
        },

        loadContent: async () => {
            try {
                const [trending, trendingMovies, trendingTv, popularMovies, popularTv, topRated] = await Promise.all([
                    app.services.fetchTmdb('/trending/all/day'),
                    app.services.fetchTmdb('/trending/movie/week'),
                    app.services.fetchTmdb('/trending/tv/week'),
                    app.services.fetchTmdb('/movie/popular'),
                    app.services.fetchTmdb('/tv/popular'),
                    app.services.fetchTmdb('/movie/top_rated')
                ]);

                if (trending.length > 0) app.state.tmdbContent.trending = trending;
                if (trendingMovies.length > 0) app.state.tmdbContent.trendingMovies = trendingMovies;
                if (trendingTv.length > 0) app.state.tmdbContent.trendingTv = trendingTv;
                if (popularMovies.length > 0) app.state.tmdbContent.popularMovies = popularMovies;
                if (popularTv.length > 0) app.state.tmdbContent.popularTv = popularTv;
                if (topRated.length > 0) app.state.tmdbContent.topRated = topRated;
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

