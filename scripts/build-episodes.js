const fs = require('fs');
const path = require('path');
const https = require('https');

const TXT_URL = 'https://vidapi.ru/ids/eps_list_tmdb.txt';
const DATA_DIR = path.join(__dirname, '..', 'data', 'episodes');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function build() {
  console.log('Downloading eps_list_tmdb.txt...');
  const text = await download(TXT_URL);
  const lines = text.split('\n').filter(l => /^\d+_\d+x\d+$/.test(l.trim()));
  console.log(`Total lines: ${lines.length}`);

  // Group by show ID
  const shows = new Map();
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)_(\d+)x(\d+)$/);
    if (!m) continue;
    const showId = m[1];
    const season = parseInt(m[2]);
    const episode = parseInt(m[3]);
    if (!shows.has(showId)) shows.set(showId, new Map());
    const seasons = shows.get(showId);
    if (!seasons.has(season)) seasons.set(season, []);
    seasons.get(season).push(episode);
  }
  console.log(`Unique shows: ${shows.size}`);

  // Ensure output dir
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Save each show
  let saved = 0;
  for (const [showId, seasons] of shows) {
    const obj = {};
    const sortedSeasons = [...seasons.keys()].sort((a, b) => a - b);
    for (const s of sortedSeasons) {
      obj[s] = seasons.get(s).sort((a, b) => a - b);
    }
    const json = JSON.stringify(obj);
    fs.writeFileSync(path.join(DATA_DIR, `${showId}.json`), json, 'utf8');
    saved++;
  }
  console.log(`Saved ${saved} episode files.`);
}

build().catch(console.error);
