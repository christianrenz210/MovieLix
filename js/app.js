const API = {
  moviePage: (n) => `https://vidapi.ru/movies/latest/page-${n}.json`,
  tvPage: (n) => `https://vidapi.ru/tvshows/latest/page-${n}.json`,
  embedMovie: (id) => `https://vaplayer.ru/embed/movie/${id}?primaryColor=%23E50914&autoplay=1`,
  embedTV: (id, s, e) => `https://vaplayer.ru/embed/tv/${id}/${s}/${e}?primaryColor=%23E50914&autoplay=1`,
  epsIDList: 'https://vidapi.ru/ids/eps_list_tmdb.txt',
  tmdbDetail: (id, type) => `https://api.themoviedb.org/3/${type}/${id}?api_key=1f6107ab05889d672851a61318daa0a7&language=en-US`,
};

let allMovies = [];
let allTVShows = [];
let allGenres = [];
let currentPage = 1;
let currentGenre = 'All';
let currentSearch = '';

let lastMoviePage = 0;
let lastTVPage = 0;
let movieTotalPages = Infinity;
let tvTotalPages = Infinity;
let isSearchingMore = false;

let episodeIDCache = null;
let episodeIDData = null;

function showLoading(container) {
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function fetchMovies(pages = 5) {
  const all = [];
  const promises = [];
  for (let i = 1; i <= pages; i++) {
    promises.push(fetchJSON(API.moviePage(i)));
  }
  const results = await Promise.all(promises);
  for (const data of results) {
    if (data && data.items) {
      all.push(...data.items.map(item => normalizeItem(item, 'movie')));
      if (data.total_pages) movieTotalPages = data.total_pages;
    }
  }
  lastMoviePage = Math.max(lastMoviePage, pages);
  return all;
}

async function fetchTVShows(pages = 5) {
  const all = [];
  const promises = [];
  for (let i = 1; i <= pages; i++) {
    promises.push(fetchJSON(API.tvPage(i)));
  }
  const results = await Promise.all(promises);
  for (const data of results) {
    if (data && data.items) {
      all.push(...data.items.map(item => normalizeItem(item, 'tv')));
      if (data.total_pages) tvTotalPages = data.total_pages;
    }
  }
  lastTVPage = Math.max(lastTVPage, pages);
  return all;
}

async function fetchMoreMovies(count = 5) {
  const results = [];
  const start = lastMoviePage + 1;
  const end = Math.min(start + count - 1, movieTotalPages);
  for (let i = start; i <= end; i++) {
    const data = await fetchJSON(API.moviePage(i));
    if (data && data.items) {
      const items = data.items.map(item => normalizeItem(item, 'movie'));
      results.push(...items);
      movieTotalPages = data.total_pages;
    }
    if (data && i >= data.total_pages) break;
  }
  lastMoviePage = end;
  allMovies.push(...results);
  return results;
}

async function fetchMoreTVShows(count = 5) {
  const results = [];
  const start = lastTVPage + 1;
  const end = Math.min(start + count - 1, tvTotalPages);
  for (let i = start; i <= end; i++) {
    const data = await fetchJSON(API.tvPage(i));
    if (data && data.items) {
      const items = data.items.map(item => normalizeItem(item, 'tv'));
      results.push(...items);
      tvTotalPages = data.total_pages;
    }
    if (data && i >= data.total_pages) break;
  }
  lastTVPage = end;
  allTVShows.push(...results);
  return results;
}

function normalizeItem(item, type) {
  return {
    ...item,
    _type: type,
    tmdb_id: item.tmdb_id ? String(item.tmdb_id) : '',
    imdb_id: item.imdb_id ? String(item.imdb_id) : '',
  };
}

async function fetchOverview(id, type) {
  const data = await fetchJSON(API.tmdbDetail(id, type === 'tv' ? 'tv' : 'movie'));
  return data ? (data.overview || '') : '';
}

async function fetchEpisodeIDList() {
  if (episodeIDData) return episodeIDData;
  const text = await fetchText(API.epsIDList);
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  episodeIDData = lines;
  return lines;
}

function parseEpisodeLine(line) {
  const match = line.match(/^(\d+)_(\d+)x(\d+)$/);
  if (!match) return null;
  return {
    showId: match[1],
    season: match[2],
    episode: match[3],
  };
}

function findEpisodesForShow(tmdbId) {
  if (!episodeIDData || !tmdbId) return null;
  const episodes = [];
  for (const line of episodeIDData) {
    const parsed = parseEpisodeLine(line);
    if (parsed && parsed.showId === tmdbId) {
      episodes.push(parsed);
    }
  }
  return episodes.length > 0 ? episodes : null;
}

function extractGenres(items) {
  const genreSet = new Set();
  items.forEach(item => {
    if (item.genre) {
      item.genre.split(',').forEach(g => {
        const trimmed = g.trim();
        if (trimmed) genreSet.add(trimmed);
      });
    }
  });
  return ['All', ...Array.from(genreSet).sort()];
}

function filterByGenre(items, genre) {
  if (!genre || genre === 'All') return items;
  return items.filter(item => {
    if (!item.genre) return false;
    return item.genre.split(',').some(g => g.trim().toLowerCase() === genre.toLowerCase());
  });
}

function filterBySearch(items, query) {
  if (!query) return items;
  const q = query.toLowerCase().trim();
  return items.filter(item => {
    if (!item.title) return false;
    const title = item.title.toLowerCase();
    if (title.includes(q)) return true;
    if (item.genre && item.genre.toLowerCase().includes(q)) return true;
    if (item.year && item.year.includes(q)) return true;
    return false;
  });
}

function getItemsByGenre(items, genre, limit) {
  const filtered = items.filter(item => {
    if (!item.genre) return false;
    return item.genre.split(',').some(g => g.trim().toLowerCase() === genre.toLowerCase());
  });
  return limit ? filtered.slice(0, limit) : filtered;
}

function createMovieCard(item) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.dataset.type = item._type || 'movie';
  card.dataset.id = item.imdb_id || item.tmdb_id;

  const posterUrl = item.poster_url || '';
  const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#333"/><text x="50%" y="50%" text-anchor="middle" fill="#666" font-size="14" font-family="sans-serif">No Poster</text></svg>');
  const year = item.year || '';
  const genreFirst = item.genre ? item.genre.split(',')[0].trim() : '';
  const rating = item.rating ? parseFloat(item.rating).toFixed(1) : '';

  card.innerHTML = `
    <img src="${posterUrl}" alt="${item.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.src='${fallback}'">
    <div class="card-overlay">
      <div class="card-title">${item.title}</div>
      <div class="card-sub">${year}${genreFirst ? ' · ' + genreFirst : ''}</div>
    </div>
    ${rating ? `<div class="rating-badge">${rating}</div>` : ''}
    ${genreFirst ? `<div class="genre-badge">${genreFirst}</div>` : ''}
  `;

  card.addEventListener('click', () => {
    sessionStorage.setItem('movielix_item', JSON.stringify(item));
    const id = item.imdb_id || item.tmdb_id;
    if (item._type === 'tv') {
      window.location.href = `watch.html?type=tv&id=${id}`;
    } else {
      window.location.href = `watch.html?type=movie&id=${id}`;
    }
  });

  return card;
}

function renderRow(containerId, items, title) {
  const container = document.getElementById(containerId);
  if (!container || !items || items.length === 0) return;
  container.innerHTML = '';

  let seeAllLink = '';
  if (title === 'Latest Movies') seeAllLink = '<a href="movies.html" class="see-all">See All</a>';
  else if (title === 'Latest TV Shows') seeAllLink = '<a href="tvshows.html" class="see-all">See All</a>';

  const section = document.createElement('div');
  section.className = 'content-section';
  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${title}</h2>
      ${seeAllLink}
    </div>
    <div class="row-container">
      <button class="scroll-arrow scroll-arrow-left">&#8249;</button>
      <div class="row-content"></div>
      <button class="scroll-arrow scroll-arrow-right">&#8250;</button>
    </div>
  `;

  container.appendChild(section);

  const rowContent = section.querySelector('.row-content');
  const leftArrow = section.querySelector('.scroll-arrow-left');
  const rightArrow = section.querySelector('.scroll-arrow-right');

  const scrollAmount = () => {
    const firstCard = rowContent.querySelector('.movie-card');
    if (!firstCard) return 400;
    const style = getComputedStyle(rowContent);
    const gap = parseFloat(style.gap) || 8;
    return firstCard.offsetWidth + gap;
  };

  leftArrow.addEventListener('click', () => { rowContent.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }); });
  rightArrow.addEventListener('click', () => { rowContent.scrollBy({ left: scrollAmount(), behavior: 'smooth' }); });

  items.forEach(item => {
    rowContent.appendChild(createMovieCard(item));
  });
}

function renderGenreRow(containerId, items, genre) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const genreItems = getItemsByGenre(items, genre, 20);
  if (genreItems.length < 3) return;

  const section = document.createElement('div');
  section.className = 'content-section';
  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${genre} Movies</h2>
      <span class="see-all" onclick="window.location.href='movies.html?genre=${encodeURIComponent(genre)}'">See All</span>
    </div>
    <div class="row-container">
      <button class="scroll-arrow scroll-arrow-left">&#8249;</button>
      <div class="row-content"></div>
      <button class="scroll-arrow scroll-arrow-right">&#8250;</button>
    </div>
  `;

  container.appendChild(section);

  const rowContent = section.querySelector('.row-content');
  const leftArrow = section.querySelector('.scroll-arrow-left');
  const rightArrow = section.querySelector('.scroll-arrow-right');

  const scrollAmount = () => {
    const firstCard = rowContent.querySelector('.movie-card');
    if (!firstCard) return 400;
    const style = getComputedStyle(rowContent);
    const gap = parseFloat(style.gap) || 8;
    return firstCard.offsetWidth + gap;
  };

  leftArrow.addEventListener('click', () => { rowContent.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }); });
  rightArrow.addEventListener('click', () => { rowContent.scrollBy({ left: scrollAmount(), behavior: 'smooth' }); });

  genreItems.forEach(item => {
    rowContent.appendChild(createMovieCard(item));
  });
}

function renderGrid(containerId, items, page, perPage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const pageItems = items.slice(start, end);

  if (pageItems.length === 0) {
    container.innerHTML = '<div class="text-center py-5"><p class="text-muted">No results found.</p></div>';
    return;
  }

  pageItems.forEach(item => {
    container.appendChild(createMovieCard(item));
  });
}

function renderPagination(containerId, totalItems, currentPage, perPage, callback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / perPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.textContent = '‹';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => callback(Math.max(1, currentPage - 1)));
  container.appendChild(prevBtn);

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4 && startPage > 1) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => callback(i));
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.textContent = '›';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => callback(Math.min(totalPages, currentPage + 1)));
  container.appendChild(nextBtn);
}

function renderGenreButtons(containerId, genres, activeGenre, callback) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  genres.forEach(genre => {
    const btn = document.createElement('button');
    btn.className = `genre-btn ${genre === activeGenre ? 'active' : ''}`;
    btn.textContent = genre;
    btn.addEventListener('click', () => callback(genre));
    container.appendChild(btn);
  });
}

function setupNavbar() {
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);
  });
}

function renderSearchResults(results, searchResultsEl, query) {
  searchResultsEl.innerHTML = '';
  if (results.length === 0) {
    searchResultsEl.innerHTML = `
      <div class="text-center py-4">
        <p class="text-muted">No results found for "${query}"</p>
        <small class="text-muted">Try a different search term.</small>
      </div>`;
    return;
  }
  results.forEach(item => {
    const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="70"><rect width="50" height="70" fill="#333"/></svg>');
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <img src="${item.poster_url || ''}" alt="" onerror="this.src='${fallback}'">
      <div class="info">
        <h6>${item.title}</h6>
        <small>${item.year || ''} · ${item._type === 'movie' ? 'Movie' : 'TV Show'}${item.rating ? ' · ★ ' + parseFloat(item.rating).toFixed(1) : ''}</small>
      </div>
    `;
    div.addEventListener('click', () => {
      sessionStorage.setItem('movielix_item', JSON.stringify(item));
      closeSearchOverlay();
      window.location.href = `watch.html?type=${item._type}&id=${item.imdb_id || item.tmdb_id}`;
    });
    searchResultsEl.appendChild(div);
  });
}

async function expandSearch(query, searchResultsEl) {
  if (isSearchingMore) return;
  isSearchingMore = true;

  const statusEl = document.createElement('div');
  statusEl.className = 'text-center py-2';
  statusEl.id = 'searchMoreStatus';
  statusEl.innerHTML = '<small class="text-muted"><div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:6px;"></div> Searching more content...</small>';
  searchResultsEl.appendChild(statusEl);

  let currentResults = filterBySearch([...allMovies, ...allTVShows], query);
  let attempts = 0;

  while (currentResults.length < 20 && attempts < 6) {
    attempts++;
    const moviePagesLeft = lastMoviePage < movieTotalPages;
    const tvPagesLeft = lastTVPage < tvTotalPages;
    if (!moviePagesLeft && !tvPagesLeft) break;

    const promises = [];
    if (moviePagesLeft) promises.push(fetchMoreMovies(2));
    if (tvPagesLeft) promises.push(fetchMoreTVShows(2));
    await Promise.all(promises);
    currentResults = filterBySearch([...allMovies, ...allTVShows], query);
  }

  statusEl.remove();
  renderSearchResults(currentResults.slice(0, 20), searchResultsEl, query);
  isSearchingMore = false;
}

let closeSearchOverlay = () => {};

function setupSearchOverlay() {
  const searchToggle = document.getElementById('searchToggle');
  const navSearch = document.getElementById('navSearch');
  const searchInput = document.getElementById('globalSearchInput');
  const searchResults = document.getElementById('searchResults');
  const closeSearch = document.getElementById('closeSearch');

  if (!searchToggle || !navSearch) return;

  searchToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const isActive = navSearch.classList.contains('active');
    if (isActive) {
      closeSearchOverlay();
    } else {
      navSearch.classList.add('active');
      setTimeout(() => searchInput.focus(), 100);
    }
  });

  closeSearchOverlay = () => {
    navSearch.classList.remove('active');
    searchResults.classList.remove('active');
    searchInput.value = '';
    searchResults.innerHTML = '';
  };

  if (closeSearch) closeSearch.addEventListener('click', closeSearchOverlay);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearchOverlay();
  });

  document.addEventListener('click', (e) => {
    if (navSearch.classList.contains('active') &&
        !e.target.closest('.nav-search-container') &&
        !e.target.closest('#searchResults')) {
      closeSearchOverlay();
    }
  });

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
        return;
      }
      const allItems = [...allMovies, ...allTVShows];
      const results = filterBySearch(allItems, q).slice(0, 20);
      renderSearchResults(results, searchResults, q);
      searchResults.classList.add('active');

      if (results.length < 20 && (lastMoviePage < movieTotalPages || lastTVPage < tvTotalPages)) {
        expandSearch(q, searchResults);
      }
    }, 350);
  });
}

async function initHomepage() {
  setupNavbar();
  setupSearchOverlay();

  const heroContainer = document.getElementById('heroBanner');
  const rowsContainer = document.getElementById('contentRows');
  if (!rowsContainer) return;

  showLoading(rowsContainer);

  allMovies = await fetchMovies(5);
  allTVShows = await fetchTVShows(15);
  allGenres = extractGenres(allMovies);

  rowsContainer.innerHTML = '';

  if (heroContainer && allMovies.length > 0) {
    const featured = [...allMovies].sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))[0];
    const bg = featured.poster_url || '';
    heroContainer.style.backgroundImage = `url(${bg})`;
    heroContainer.innerHTML = `
      <div class="hero-content">
        <h1 class="hero-title">${featured.title}</h1>
        <div class="hero-meta">
          ${featured.rating ? `<span class="rating">★ ${parseFloat(featured.rating).toFixed(1)}</span>` : ''}
          ${featured.year ? `<span class="badge-year">${featured.year}</span>` : ''}
          <span>Movie</span>
        </div>
        <div class="hero-genre">${featured.genre || ''}</div>
        <p class="hero-desc">${featured.overview || ''}</p>
        <div>
          <a href="watch.html?type=movie&id=${featured.imdb_id || featured.tmdb_id}" class="hero-btn hero-btn-primary" id="playFeaturedBtn">▶ Play</a>
          <button class="hero-btn hero-btn-secondary" id="moreInfoBtn">ℹ More Info</button>
        </div>
      </div>
    `;

    document.getElementById('playFeaturedBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem('movielix_item', JSON.stringify(featured));
      window.location.href = `watch.html?type=movie&id=${featured.imdb_id || featured.tmdb_id}`;
    });

    document.getElementById('moreInfoBtn')?.addEventListener('click', () => {
      sessionStorage.setItem('movielix_item', JSON.stringify(featured));
      window.location.href = `watch.html?type=movie&id=${featured.imdb_id || featured.tmdb_id}`;
    });
  }

  const sortedMovies = [...allMovies].sort((a, b) => parseFloat(b.popularity || 0) - parseFloat(a.popularity || 0));
  const topRated = [...allMovies].sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
  const sortedTVShows = [...allTVShows].sort((a, b) => parseFloat(b.popularity || 0) - parseFloat(a.popularity || 0));

  renderRow('latestMoviesRow', allMovies, 'Latest Movies');
  renderRow('latestTVRow', allTVShows, 'Latest TV Shows');
  renderRow('topTVRow', sortedTVShows.slice(0, 10), 'Top TV Shows');
  renderRow('trendingRow', sortedMovies, 'Trending Now');
  renderRow('topRatedRow', topRated, 'Top Rated');

  allGenres.filter(g => g !== 'All').forEach(genre => {
    renderGenreRow('genreRows', allMovies, genre);
  });

  const tvGenres = extractGenres(allTVShows);
  tvGenres.filter(g => g !== 'All').slice(0, 6).forEach(genre => {
    const genreItems = getItemsByGenre(allTVShows, genre, 20);
    if (genreItems.length < 3) return;
    const section = document.createElement('div');
    section.className = 'content-section';
    section.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">${genre} TV Shows</h2>
        <span class="see-all" onclick="window.location.href='tvshows.html?genre=${encodeURIComponent(genre)}'">See All</span>
      </div>
      <div class="row-container">
        <button class="scroll-arrow scroll-arrow-left">&#8249;</button>
        <div class="row-content"></div>
        <button class="scroll-arrow scroll-arrow-right">&#8250;</button>
      </div>
    `;
    document.getElementById('tvGenreRows').appendChild(section);
    const rowContent = section.querySelector('.row-content');
    const leftArrow = section.querySelector('.scroll-arrow-left');
    const rightArrow = section.querySelector('.scroll-arrow-right');
    const scrollAmount = () => {
      const firstCard = rowContent.querySelector('.movie-card');
      if (!firstCard) return 400;
      const style = getComputedStyle(rowContent);
      const gap = parseFloat(style.gap) || 8;
      return firstCard.offsetWidth + gap;
    };
    leftArrow.addEventListener('click', () => { rowContent.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }); });
    rightArrow.addEventListener('click', () => { rowContent.scrollBy({ left: scrollAmount(), behavior: 'smooth' }); });
    genreItems.forEach(item => rowContent.appendChild(createMovieCard(item)));
  });

  renderTop10Section();
}

function renderTop10Section() {
  const container = document.getElementById('top10Section');
  if (!container || !allTVShows || allTVShows.length === 0) return;

  const priorityTitles = ['Teach You a Lesson', 'The WONDERfools', 'Viral Hit', 'Sins and Roses', 'My Royal Nemesis', 'Maximum Pleasure Guaranteed', 'Unconditional'];
  const priority = [];
  const rest = [];

  for (const item of allTVShows) {
    if (priorityTitles.includes(item.title) && !priority.some(p => p.title === item.title)) {
      priority.push(item);
    } else {
      rest.push(item);
    }
  }

  priority.sort((a, b) => priorityTitles.indexOf(a.title) - priorityTitles.indexOf(b.title));
  rest.sort((a, b) => parseFloat(b.popularity || 0) - parseFloat(a.popularity || 0));

  const top10 = [...priority, ...rest].slice(0, 10);

  if (top10.length === 0) return;

  const badges = ['recently-added', 'new-episode', 'recently-added', 'new-episode', 'recently-added', 'new-episode', 'recently-added', 'new-episode', 'watch-now', 'watch-now'];
  const badgeLabels = ['Recently Added', 'New Episode', 'Recently Added', 'New Episode', 'Recently Added', 'New Episode', 'Recently Added', 'New Episode', 'Watch Now', 'Watch Now'];

  const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#222"/></svg>');

  let html = `
    <div class="top10-section">
      <div class="top10-header">
        <span class="top10-badge">TOP 10</span>
        <h2 class="top10-title">TV Shows in the Philippines Today</h2>
        <span class="top10-subtitle">Updated daily</span>
      </div>
      <div class="top10-carousel">`;

  top10.forEach((item, i) => {
    const rank = i + 1;
    const poster = item.poster_url || '';
    const rating = item.rating ? parseFloat(item.rating).toFixed(1) : '';
    const badgeClass = badges[i] || 'recently-added';
    const badgeLabel = badgeLabels[i] || 'Recently Added';
    const year = item.year || '';

    const rankSvg = `<svg class="top10-rank-svg" viewBox="0 0 120 150" preserveAspectRatio="xMinYMax meet"><text x="0" y="138" fill="#fff" stroke="#595959" stroke-width="4" font-weight="900" font-size="165" font-family="'Helvetica Neue', Arial, sans-serif">${rank}</text></svg>`;

    html += `
        <div class="top10-card" data-type="${item._type || 'tv'}" data-id="${item.imdb_id || item.tmdb_id}">
          ${rankSvg}
          <div class="top10-poster-wrap">
            <img src="${poster}" alt="${item.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.src='${fallback}'">
            <div class="top10-overlay">
              <span class="top10-badge-tag ${badgeClass}">${badgeLabel}</span>
              <div class="top10-card-title">${item.title}</div>
              <div class="top10-card-meta">
                ${rating ? `<span class="rating-star">★</span> <span>${rating}</span>` : ''}
                ${year ? `<span>${year}</span>` : ''}
              </div>
            </div>
            ${badgeClass === 'watch-now' ? '<button class="top10-watch-btn">▶ Watch Now</button>' : ''}
          </div>
        </div>`;
  });

  html += `
      </div>
    </div>`;

  container.innerHTML = html;

  container.querySelectorAll('.top10-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const type = card.dataset.type;
      const item = top10.find(i => (i.imdb_id || i.tmdb_id) === id);
      if (item) {
        sessionStorage.setItem('movielix_item', JSON.stringify(item));
        window.location.href = `watch.html?type=${type}&id=${id}`;
      }
    });
  });
}

async function initMoviesPage() {
  setupNavbar();
  setupSearchOverlay();

  const grid = document.getElementById('moviesGrid');
  const filterContainer = document.getElementById('genreFilter');
  const paginationContainer = document.getElementById('pagination');
  const totalCount = document.getElementById('totalCount');
  if (!grid) return;

  showLoading(grid);

  const urlParams = new URLSearchParams(window.location.search);
  const urlGenre = urlParams.get('genre');

  allMovies = await fetchMovies(15);
  allGenres = extractGenres(allMovies);

  currentGenre = urlGenre && allGenres.includes(urlGenre) ? urlGenre : 'All';
  currentPage = 1;

  const update = () => {
    let filtered = filterByGenre(allMovies, currentGenre);
    if (currentSearch) filtered = filterBySearch(filtered, currentSearch);
    if (totalCount) totalCount.textContent = filtered.length;
    renderGrid('moviesGrid', filtered, currentPage, 24);
    renderPagination('pagination', filtered.length, currentPage, 24, (page) => {
      currentPage = page;
      update();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  renderGenreButtons('genreFilter', allGenres, currentGenre, (genre) => {
    currentGenre = genre;
    currentPage = 1;
    update();
    const url = new URL(window.location);
    url.searchParams.set('genre', genre);
    window.history.replaceState({}, '', url);
  });

  update();
}

async function initTVShowsPage() {
  setupNavbar();
  setupSearchOverlay();

  const grid = document.getElementById('tvGrid');
  const filterContainer = document.getElementById('genreFilter');
  const paginationContainer = document.getElementById('pagination');
  const totalCount = document.getElementById('totalCount');
  if (!grid) return;

  showLoading(grid);

  allTVShows = await fetchTVShows(15);
  allGenres = extractGenres(allTVShows);

  currentGenre = 'All';
  currentPage = 1;

  const update = () => {
    let filtered = filterByGenre(allTVShows, currentGenre);
    if (currentSearch) filtered = filterBySearch(filtered, currentSearch);
    if (totalCount) totalCount.textContent = filtered.length;
    renderGrid('tvGrid', filtered, currentPage, 24);
    renderPagination('pagination', filtered.length, currentPage, 24, (page) => {
      currentPage = page;
      update();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  renderGenreButtons('genreFilter', allGenres, currentGenre, (genre) => {
    currentGenre = genre;
    currentPage = 1;
    update();
  });

  update();
}

function loadPlayer(src) {
  const wrapper = document.getElementById('playerWrapper');
  if (wrapper) wrapper.innerHTML = `<iframe src="${src}" allowfullscreen allow="autoplay; fullscreen"></iframe>`;
}

function renderEpisodeList(episodes, showId, currentSeason, currentEpisode) {
  const container = document.getElementById('episodesSection');
  if (!container) return;

  const grouped = {};
  episodes.forEach(ep => {
    if (!grouped[ep.season]) grouped[ep.season] = [];
    grouped[ep.season].push(ep);
  });

  const seasons = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
  const activeSeason = currentSeason || seasons[0] || '1';

  let html = '<div class="season-selector" style="display:flex;">';
  html += '<label>Season:</label><select id="epSeasonSelect">';
  seasons.forEach(s => {
    html += `<option value="${s}" ${s === activeSeason ? 'selected' : ''}>Season ${s}</option>`;
  });
  html += '</select></div>';

  html += '<div class="episode-list" id="episodeList">';
  (grouped[activeSeason] || []).forEach(ep => {
    const epNum = ep.episode;
    const isActive = epNum === currentEpisode && activeSeason === currentSeason;
    html += `
      <div class="episode-item ${isActive ? 'active' : ''}" data-season="${ep.season}" data-episode="${epNum}">
        <div class="ep-number">${epNum}</div>
        <div class="ep-info">
          <h6>Episode ${epNum}</h6>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;

  const seasonSelect = document.getElementById('epSeasonSelect');
  if (seasonSelect) {
    seasonSelect.addEventListener('change', () => {
      renderEpisodeList(episodes, showId, seasonSelect.value, currentEpisode);
    });
  }

  container.querySelectorAll('.episode-item').forEach(el => {
    el.addEventListener('click', () => {
      const season = el.dataset.season;
      const episode = el.dataset.episode;
      loadPlayer(API.embedTV(showId, season, episode));
      const url = new URL(window.location);
      url.searchParams.set('s', season);
      url.searchParams.set('e', episode);
      window.history.replaceState({}, '', url);
      container.querySelectorAll('.episode-item').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

async function fetchTMDBTVDetails(tmdbId) {
  return await fetchJSON(API.tmdbDetail(tmdbId, 'tv'));
}

async function fetchTMDBSeasonEpisodes(tmdbId, seasonNum) {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=1f6107ab05889d672851a61318daa0a7&language=en-US`;
  return await fetchJSON(url);
}

function renderEpisodeBrowser(showId, localData, currentSeason, currentEpisode) {
  const container = document.getElementById('episodesSection');
  if (!container) return;

  if (!localData || Object.keys(localData).length === 0) {
    container.innerHTML = '<div class="text-center py-4"><p class="text-muted">Episode list unavailable.</p></div>';
    return;
  }

  const item = JSON.parse(sessionStorage.getItem('movielix_item') || '{}');
  const posterUrl = item.poster_url || '';

  const seasons = Object.keys(localData).sort((a, b) => parseInt(a) - parseInt(b));
  const activeSeason = currentSeason || seasons[0] || '1';

  let html = '<div class="episodes-header" id="episodesHeader">';
  html += '<div class="episodes-header-left">';
  html += '<span class="episodes-toggle-icon open" id="episodesToggleIcon">▼</span>';
  html += '<h2>Episodes</h2>';
  html += '</div>';
  html += '<span class="episodes-badge">TV Series</span>';
  html += '</div>';
  html += '<div class="episodes-body open" id="episodesBody">';
  html += '<div class="season-selector" style="display:flex;align-items:center;gap:10px;margin-bottom:15px;padding:0.5rem 3rem;">';
  html += '<label>Season:</label>';
  html += '<select id="epSeasonSelect" class="form-select" style="width:auto;background:#222;color:#fff;border:1px solid #444;padding:0.35rem 1rem;border-radius:4px;cursor:pointer;font-size:0.85rem;">';
  seasons.forEach(s => {
    html += `<option value="${s}" ${s === activeSeason ? 'selected' : ''}>Season ${s}</option>`;
  });
  html += '</select></div>';
  html += '<div class="episode-list" id="episodeList"></div>';
  html += '</div>';
  container.innerHTML = html;

  renderEpisodeGrid(showId, localData, activeSeason, currentEpisode, posterUrl);

  document.getElementById('epSeasonSelect')?.addEventListener('change', () => {
    const season = document.getElementById('epSeasonSelect').value;
    renderEpisodeGrid(showId, localData, season, null, posterUrl);
    const url = new URL(window.location);
    url.searchParams.set('s', season);
    url.searchParams.set('e', '1');
    window.history.replaceState({}, '', url);
  });

  const epHeader = document.getElementById('episodesHeader');
  const epBody = document.getElementById('episodesBody');
  const epIcon = document.getElementById('episodesToggleIcon');
  if (epHeader && epBody && epIcon) {
    epHeader.addEventListener('click', (e) => {
      if (e.target.tagName === 'SELECT' || e.target.closest('.season-selector')) return;
      epBody.classList.toggle('open');
      epIcon.classList.toggle('open');
    });
  }

  fetchVidAPIEpisodeTitles(showId, localData);
}

function renderEpisodeGrid(showId, localData, season, activeEpisode, posterUrl) {
  const episodeList = document.getElementById('episodeList');
  if (!episodeList) return;

  const episodes = localData[season] || [];
  if (episodes.length === 0) {
    episodeList.innerHTML = '<p class="text-muted text-center py-2">No episodes found for this season.</p>';
    return;
  }

  const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="112"><rect width="200" height="112" fill="#222"/></svg>');

  let html = '';
  episodes.forEach(epNum => {
    const isActive = epNum === parseInt(activeEpisode);
    const titleKey = `ep_title_${season}_${epNum}`;
    const savedTitle = sessionStorage.getItem(titleKey);
    html += `
      <div class="episode-item ${isActive ? 'active' : ''}" data-season="${season}" data-episode="${epNum}">
        <div class="episode-number-box">${epNum}</div>
        <div class="episode-thumb-wrap">
          <img src="${posterUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="episode-thumb-placeholder" style="${posterUrl ? 'display:none' : ''}">${epNum}</div>
          <div class="episode-progress" style="width:0"></div>
        </div>
        <div class="episode-info-wrap">
          <div class="episode-info-title">${savedTitle || `Episode ${epNum}`}</div>
          <div class="episode-info-desc"></div>
        </div>
        <div class="episode-runtime"></div>
      </div>`;
  });
  episodeList.innerHTML = html;

  episodeList.querySelectorAll('.episode-item').forEach(el => {
    el.addEventListener('click', () => {
      const season = el.dataset.season;
      const episode = el.dataset.episode;
      loadPlayer(API.embedTV(showId, season, episode));
      const url = new URL(window.location);
      url.searchParams.set('s', season);
      url.searchParams.set('e', episode);
      window.history.replaceState({}, '', url);
      episodeList.querySelectorAll('.episode-item').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

const vidAPIEpisodeCache = {};

async function fetchVidAPIEpisodeTitles(showId, localData) {
  if (vidAPIEpisodeCache[showId]) return;

  for (let page = 1; page <= 100; page++) {
    const data = await fetchJSON(`https://vidapi.ru/episodes/latest/page-${page}.json`);
    if (!data || !data.items) break;
    for (const item of data.items) {
      if (String(item.show_tmdb_id) === showId) {
        const key = `ep_title_${item.season_number}_${item.episode_number}`;
        sessionStorage.setItem(key, item.episode_title || `Episode ${item.episode_number}`);

        const epList = document.getElementById('episodeList');
        if (epList) {
          const cards = epList.querySelectorAll('.episode-item');
          cards.forEach(card => {
            if (parseInt(card.dataset.season) === item.season_number && parseInt(card.dataset.episode) === item.episode_number) {
              const titleEl = card.querySelector('.episode-info-title');
              if (titleEl) titleEl.textContent = item.episode_title || `Episode ${item.episode_number}`;
              const descEl = card.querySelector('.episode-info-desc');
              if (item.air_date && descEl) descEl.textContent = item.air_date;
            }
          });
        }
      }
    }
  }
  vidAPIEpisodeCache[showId] = true;
}

async function setupPlayerPage() {
  setupNavbar();
  setupSearchOverlay();

  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get('type') || 'movie';
  const id = urlParams.get('id');
  const item = JSON.parse(sessionStorage.getItem('movielix_item') || '{}');

  const playerWrapper = document.getElementById('playerWrapper');
  const infoSection = document.getElementById('movieInfo');
  const episodesSection = document.getElementById('episodesSection');
  const moreContent = document.getElementById('moreContent');

  if (!playerWrapper || !id) {
    if (playerWrapper) {
      playerWrapper.innerHTML = '<div class="text-center py-5"><p class="text-muted">No content selected. <a href="index.html" style="color:#E50914;">Go home</a></p></div>';
    }
    return;
  }

  let tmdbId = item.tmdb_id || '';
  if (!tmdbId && /^\d+$/.test(id)) tmdbId = id;
  let overview = item.overview || '';

  if (!overview && tmdbId) {
    overview = await fetchOverview(tmdbId, type);
  }

  if (type === 'tv') {
    const s = urlParams.get('s') || '1';
    const e = urlParams.get('e') || '1';
    loadPlayer(API.embedTV(id, s, e));

    if (episodesSection) {
      episodesSection.style.display = 'block';
      const localData = await fetchJSON(`data/episodes/${id}.json`);
      if (localData && Object.keys(localData).length > 0) {
        renderEpisodeBrowser(id, localData, s, e);
      } else if (tmdbId && tmdbId !== id) {
        const tmdbData = await fetchJSON(`data/episodes/${tmdbId}.json`);
        if (tmdbData && Object.keys(tmdbData).length > 0) {
          renderEpisodeBrowser(tmdbId, tmdbData, s, e);
        } else {
          episodesSection.innerHTML = '<div class="text-center py-4"><p class="text-muted">Episode list unavailable for this title.</p></div>';
        }
      } else {
        episodesSection.innerHTML = '<div class="text-center py-4"><p class="text-muted">Episode list unavailable for this title.</p></div>';
      }
    }
  } else {
    loadPlayer(API.embedMovie(id));
    if (episodesSection) episodesSection.style.display = 'none';
  }

  if (infoSection) {
    const genres = item.genre ? item.genre.split(',').map(g => `<span class="genre-tag">${g.trim()}</span>`).join('') : '';
    const desc = overview || item.overview || (item.genre ? `${item.genre} ${type === 'movie' ? 'movie' : 'TV show'} from ${item.year || ''}.` : '');
    infoSection.innerHTML = `
      <h1 class="movie-title">${item.title || 'Untitled'}</h1>
      <div class="movie-meta">
        ${item.rating ? `<span class="rating">★ ${parseFloat(item.rating).toFixed(1)}</span>` : ''}
        ${item.year ? `<span>${item.year}</span>` : ''}
        <span>${type === 'movie' ? 'Movie' : 'TV Show'}</span>
      </div>
      ${genres ? `<div class="movie-genres">${genres}</div>` : ''}
      ${desc ? `<p>${desc}</p>` : ''}
    `;
  }

  if (allMovies.length === 0 && allTVShows.length === 0) {
    const [movies, tvShows] = await Promise.all([fetchMovies(3), fetchTVShows(3)]);
    allMovies.push(...movies);
    allTVShows.push(...tvShows);
  }

  if (moreContent) {
    const allItems = [...allMovies, ...allTVShows];
    const similar = allItems.filter(i => {
      if (i.imdb_id === id || i.tmdb_id === id) return false;
      if (!i.genre || !item.genre) return false;
      return item.genre.split(',').some(g => i.genre.includes(g.trim()));
    }).slice(0, 12);

    if (similar.length > 0) {
      const section = document.createElement('div');
      section.className = 'content-section';
      section.innerHTML = `<div class="section-header"><h2 class="section-title">More Like This</h2></div><div class="row-container"><div class="row-content"></div></div>`;
      moreContent.appendChild(section);
      const rowContent = section.querySelector('.row-content');
      similar.forEach(i => rowContent.appendChild(createMovieCard(i)));
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'home') initHomepage();
  else if (page === 'movies') initMoviesPage();
  else if (page === 'tvshows') initTVShowsPage();
  else if (page === 'watch') setupPlayerPage();
});
