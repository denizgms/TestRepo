const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_FILE = path.join(__dirname, '..', 'data', 'words.json');
const USER_AGENT = 'ImposterLocalGame/1.0 (word-list generator)';

const TARGET_COUNTS = {
  footballers: 140,
  moviesSeries: 170,
  general: 1000,
  anime: 100
};

const FAMOUS_FOOTBALLERS = [
  'Lionel Messi', 'Cristiano Ronaldo', 'Neymar', 'Kylian Mbappe', 'Erling Haaland',
  'Jude Bellingham', 'Vinicius Junior', 'Lamine Yamal', 'Florian Wirtz', 'Jamal Musiala',
  'Harry Kane', 'Robert Lewandowski', 'Mohamed Salah', 'Kevin De Bruyne', 'Rodri',
  'Phil Foden', 'Bukayo Saka', 'Cole Palmer', 'Pedri', 'Gavi',
  'Frenkie de Jong', 'Bruno Fernandes', 'Martin Odegaard', 'Luka Modric', 'Toni Kroos',
  'Virgil van Dijk', 'Ruben Dias', 'William Saliba', 'Trent Alexander-Arnold', 'Achraf Hakimi',
  'Alphonso Davies', 'Joshua Kimmich', 'Manuel Neuer', 'Thibaut Courtois', 'Alisson Becker',
  'Gianluigi Donnarumma', 'Marc-Andre ter Stegen', 'Jan Oblak', 'Sadio Mane', 'Son Heung-min',
  'Luis Suarez', 'Karim Benzema', 'Antoine Griezmann', 'Thomas Muller', 'Angel Di Maria',
  'Sergio Ramos', 'Gerard Pique', 'Sergio Busquets', 'Andres Iniesta', 'Xavi',
  'Zinedine Zidane', 'Ronaldo Nazario', 'Ronaldinho', 'Pele', 'Diego Maradona',
  'Johan Cruyff', 'Franz Beckenbauer', 'Michel Platini', 'Eusebio', 'George Best',
  'Bobby Charlton', 'Gerd Muller', 'Paolo Maldini', 'Franco Baresi', 'Roberto Baggio',
  'Alessandro Del Piero', 'Francesco Totti', 'Andrea Pirlo', 'Gianluigi Buffon', 'Fabio Cannavaro',
  'Iker Casillas', 'Carles Puyol', 'Raul', 'David Beckham', 'Steven Gerrard',
  'Frank Lampard', 'Wayne Rooney', 'Paul Scholes', 'Thierry Henry', 'Patrick Vieira',
  'Dennis Bergkamp', 'Didier Drogba', 'Samuel Eto\'o', 'Yaya Toure', 'Jay-Jay Okocha',
  'Miroslav Klose', 'Bastian Schweinsteiger', 'Philipp Lahm', 'Oliver Kahn', 'Lothar Matthaus',
  'Hristo Stoichkov', 'Andriy Shevchenko', 'Kaka', 'Rivaldo', 'Romario',
  'Cafu', 'Roberto Carlos', 'Dani Alves', 'Marcelo', 'N\'Golo Kante',
  'Claude Makelele', 'Ruud Gullit', 'Marco van Basten', 'Clarence Seedorf', 'Arjen Robben',
  'Robin van Persie', 'Ruud van Nistelrooy', 'Luis Figo', 'Deco', 'Pavel Nedved',
  'Peter Schmeichel', 'Michael Laudrup', 'Edwin van der Sar', 'Oliver Giroud', 'Zlatan Ibrahimovic',
  'Gareth Bale', 'Eden Hazard', 'Cesc Fabregas', 'Mesut Ozil', 'David Villa',
  'Fernando Torres', 'Sergio Aguero', 'Carlos Tevez', 'Javier Mascherano', 'Juan Roman Riquelme',
  'Gabriel Batistuta', 'Hernan Crespo', 'Socrates', 'Zico', 'Garrincha',
  'Marta', 'Mia Hamm', 'Alexia Putellas', 'Aitana Bonmati', 'Alex Morgan',
  'Megan Rapinoe', 'Abby Wambach', 'Birgit Prinz', 'Homare Sawa', 'Sam Kerr'
];

const MOVIE_SERIES_SEEDS = [
  'The Godfather', 'Star Wars', 'Darth Vader', 'Luke Skywalker', 'Princess Leia',
  'Indiana Jones', 'Harry Potter', 'Hermione Granger', 'Ron Weasley', 'Albus Dumbledore',
  'Lord Voldemort', 'Frodo Beutlin', 'Gandalf', 'Aragorn', 'Legolas',
  'The Lord of the Rings', 'The Hobbit', 'Game of Thrones', 'Jon Snow', 'Daenerys Targaryen',
  'Tyrion Lannister', 'Arya Stark', 'Breaking Bad', 'Walter White', 'Jesse Pinkman',
  'Better Call Saul', 'Saul Goodman', 'The Sopranos', 'Tony Soprano', 'The Wire',
  'Stranger Things', 'Eleven', 'Wednesday', 'The Last of Us', 'Joel Miller',
  'Ellie Williams', 'Friends', 'Rachel Green', 'Monica Geller', 'Chandler Bing',
  'How I Met Your Mother', 'Barney Stinson', 'The Office', 'Michael Scott', 'Dwight Schrute',
  'Sherlock Holmes', 'James Bond', 'Rocky Balboa', 'Rambo', 'Forrest Gump',
  'Titanic', 'Jack Dawson', 'Rose DeWitt Bukater', 'Jurassic Park', 'John Hammond',
  'The Matrix', 'Neo', 'Trinity', 'Morpheus', 'Terminator',
  'Sarah Connor', 'Ellen Ripley', 'Alien', 'Predator', 'Avatar',
  'The Avengers', 'Iron Man', 'Tony Stark', 'Captain America', 'Steve Rogers',
  'Thor', 'Loki', 'Black Widow', 'Hulk', 'Spider-Man',
  'Peter Parker', 'Batman', 'Bruce Wayne', 'Joker', 'Harley Quinn',
  'Superman', 'Clark Kent', 'Wonder Woman', 'Diana Prince', 'Black Panther',
  'Wakanda', 'Deadpool', 'Wolverine', 'Logan', 'Professor X',
  'Magneto', 'Hannibal Lecter', 'Clarice Starling', 'The Silence of the Lambs', 'Pulp Fiction',
  'Jules Winnfield', 'Vincent Vega', 'Kill Bill', 'Beatrix Kiddo', 'Django Unchained',
  'Inglourious Basterds', 'The Dark Knight', 'Inception', 'Interstellar', 'Oppenheimer',
  'Barbie', 'Ken', 'La La Land', 'Whiplash', 'Parasite',
  'Squid Game', 'Seong Gi-hun', 'The Crown', 'Queen Elizabeth II', 'Peaky Blinders',
  'Thomas Shelby', 'House of the Dragon', 'The Mandalorian', 'Grogu', 'Ahsoka Tano',
  'Doctor Who', 'The Doctor', 'Black Mirror', 'The Boys', 'Homelander',
  'Ted Lasso', 'Succession', 'Logan Roy', 'The Bear', 'Carmy Berzatto',
  'Leonardo DiCaprio', 'Meryl Streep', 'Tom Hanks', 'Denzel Washington', 'Morgan Freeman',
  'Brad Pitt', 'Angelina Jolie', 'Julia Roberts', 'Sandra Bullock', 'Keanu Reeves',
  'Tom Cruise', 'Robert Downey Jr.', 'Scarlett Johansson', 'Samuel L. Jackson', 'Johnny Depp',
  'Will Smith', 'Ryan Gosling', 'Emma Stone', 'Jennifer Lawrence', 'Margot Robbie',
  'Christian Bale', 'Heath Ledger', 'Joaquin Phoenix', 'Natalie Portman', 'Cate Blanchett',
  'Viola Davis', 'Zendaya', 'Pedro Pascal', 'Millie Bobby Brown', 'Harrison Ford',
  'Carrie Fisher', 'Mark Hamill', 'Al Pacino', 'Robert De Niro', 'Quentin Tarantino',
  'Christopher Nolan', 'Steven Spielberg', 'Martin Scorsese', 'Greta Gerwig', 'James Cameron'
];

const ANIME_SEEDS = [
  'Dragon Ball', 'Dragon Ball Z', 'Naruto', 'Naruto Shippuden', 'One Piece',
  'Bleach', 'Death Note', 'Attack on Titan', 'Fullmetal Alchemist: Brotherhood', 'Steins;Gate',
  'Cowboy Bebop', 'Neon Genesis Evangelion', 'Sailor Moon', 'Pokemon', 'Digimon Adventure',
  'Yu-Gi-Oh!', 'Demon Slayer', 'Jujutsu Kaisen', 'Chainsaw Man', 'My Hero Academia',
  'Hunter x Hunter', 'JoJo\'s Bizarre Adventure', 'Berserk', 'Vinland Saga', 'Monster',
  'Code Geass', 'Gintama', 'Haikyu!!', 'Kuroko\'s Basketball', 'Blue Lock',
  'Tokyo Ghoul', 'Mob Psycho 100', 'One Punch Man', 'Spy x Family', 'Frieren',
  'Black Clover', 'Fairy Tail', 'Soul Eater', 'Fire Force', 'Dr. Stone',
  'Made in Abyss', 'Violet Evergarden', 'Your Name', 'Spirited Away', 'Princess Mononoke',
  'My Neighbor Totoro', 'Howl\'s Moving Castle', 'Akira', 'Ghost in the Shell', 'Perfect Blue',
  'Paprika', 'A Silent Voice', 'Weathering with You', 'Suzume', 'Nana',
  'Fruits Basket', 'Ouran High School Host Club', 'Toradora!', 'Clannad', 'Your Lie in April',
  'Kaguya-sama: Love is War', 'Oshi no Ko', 'Re:Zero', 'Sword Art Online', 'No Game No Life',
  'Konosuba', 'Overlord', 'That Time I Got Reincarnated as a Slime', 'Mushoku Tensei', 'The Rising of the Shield Hero',
  'Fate/Zero', 'Fate/stay night', 'Psycho-Pass', 'Samurai Champloo', 'Trigun',
  'Hellsing', 'Dorohedoro', 'Devilman Crybaby', 'Parasyte', 'Erased',
  'The Promised Neverland', 'Assassination Classroom', 'Food Wars!', 'Detective Conan', 'Inuyasha',
  'Rurouni Kenshin', 'Yu Yu Hakusho', 'Baki', 'Hajime no Ippo', 'Initial D',
  'Cyberpunk: Edgerunners', 'Bocchi the Rock!', 'Dungeon Meshi', 'The Apothecary Diaries', 'Solo Leveling',
  'Kill la Kill', 'Gurren Lagann', 'FLCL', 'Serial Experiments Lain', 'Madoka Magica',
  'Anohana', 'Angel Beats!', 'K-On!', 'Lucky Star', 'Cardcaptor Sakura',
  'Ranma 1/2', 'Urusei Yatsura', 'Dandadan', 'Claymore', 'Elfen Lied'
];

const WIKI_FOOTBALL_CATEGORIES = [
  'Category:Premier League players',
  'Category:La Liga players',
  'Category:Bundesliga players',
  'Category:Serie A players',
  'Category:Ligue 1 players',
  'Category:Brazilian men\'s footballers',
  'Category:Argentine men\'s footballers',
  'Category:French men\'s footballers',
  'Category:German men\'s footballers',
  'Category:Spanish men\'s footballers',
  'Category:Italian men\'s footballers',
  'Category:English men\'s footballers',
  'Category:Portugal men\'s international footballers'
];

const WIKI_MOVIE_SERIES_CATEGORIES = [
  'Category:American male film actors',
  'Category:American film actresses',
  'Category:British male film actors',
  'Category:British film actresses',
  'Category:American male television actors',
  'Category:American television actresses',
  'Category:British male television actors',
  'Category:British television actresses',
  'Category:Male characters in film',
  'Category:Female characters in film',
  'Category:Male characters in television',
  'Category:Female characters in television',
  'Category:Fictional film characters',
  'Category:Animated characters'
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPrng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function shuffled(items, seed) {
  const copy = [...items];
  const random = createPrng(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanItem(value) {
  if (!value || typeof value !== 'string') return null;
  let item = value
    .replace(/_/g, ' ')
    .replace(/\s+\((?:19|20)\d{2}(?: [^)]+)?\)$/i, '')
    .replace(/\s+\((?:film|TV series|character|footballer|actor|actress|born [^)]+|[A-Za-z]+ footballer)\)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!item || /^List of /i.test(item) || /^Lists of /i.test(item)) return null;
  if (/^(Category|Template|File):/i.test(item)) return null;
  if (item.length < 2 || item.length > 60) return null;
  return item;
}

function cleanGeneralWord(value) {
  const item = cleanItem(value);
  if (!item) return null;
  if (item.length < 3 || item.length > 22) return null;
  if (!/^[\p{L}ÄÖÜäöüß -]+$/u.test(item)) return null;
  return item.slice(0, 1).toUpperCase() + item.slice(1);
}

function pushUnique(target, seen, value) {
  const item = cleanItem(value);
  if (!item) return;
  const key = item.toLocaleLowerCase('de-DE');
  if (seen.has(key)) return;
  seen.add(key);
  target.push(item);
}

function pushGeneralUnique(target, seen, value) {
  const item = cleanGeneralWord(value);
  if (!item) return;
  const key = item.toLocaleLowerCase('de-DE');
  if (seen.has(key)) return;
  seen.add(key);
  target.push(item);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 120)}`);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
  return text;
}

async function fetchCategoryMembers(category, limit = 700) {
  const results = [];
  const directions = ['asc', 'desc'];

  for (const direction of directions) {
    let cmcontinue = null;
    while (results.length < limit) {
      const params = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmnamespace: '0',
        cmtype: 'page',
        cmlimit: '250',
        cmdir: direction,
        format: 'json',
        origin: '*'
      });
      if (cmcontinue) params.set('cmcontinue', cmcontinue);

      try {
        const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`);
        const members = data.query?.categorymembers || [];
        members.forEach((member) => results.push(member.title));
        cmcontinue = data.continue?.cmcontinue || null;
        if (!cmcontinue || members.length === 0) break;
      } catch (error) {
        console.warn(`Skipping ${category}: ${error.message}`);
        break;
      }

      await sleep(350);
    }
    await sleep(350);
  }

  return results;
}

async function buildFootballers() {
  const words = [];
  const seen = new Set();
  FAMOUS_FOOTBALLERS.forEach((name) => pushUnique(words, seen, name));

  const fetched = [];
  for (const category of WIKI_FOOTBALL_CATEGORIES) {
    const members = await fetchCategoryMembers(category, 250);
    fetched.push(...members);
    await sleep(500);
  }

  shuffled(fetched, 11).forEach((name) => {
    if (words.length < TARGET_COUNTS.footballers) pushUnique(words, seen, name);
  });

  return words.slice(0, TARGET_COUNTS.footballers);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function fetchMovieLensTitles() {
  const zipUrl = 'https://files.grouplens.org/datasets/movielens/ml-latest-small.zip';
  const zipPath = path.join(os.tmpdir(), 'ml-latest-small.zip');
  if (!fs.existsSync(zipPath)) {
    const response = await fetch(zipUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`MovieLens download failed: HTTP ${response.status}`);
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }
  const csv = execFileSync('unzip', ['-p', zipPath, 'ml-latest-small/movies.csv'], { encoding: 'utf8' });
  const rows = parseCsv(csv).slice(1);
  return rows.map((row) => row[1]).filter(Boolean);
}

async function buildMoviesSeries() {
  const words = [];
  const seen = new Set();
  MOVIE_SERIES_SEEDS.forEach((name) => pushUnique(words, seen, name));

  const wikiNames = [];
  for (const category of WIKI_MOVIE_SERIES_CATEGORIES) {
    const members = await fetchCategoryMembers(category, 250);
    wikiNames.push(...members);
    await sleep(500);
  }
  shuffled(wikiNames, 23).forEach((name) => {
    if (words.length < 420) pushUnique(words, seen, name);
  });

  const movieTitles = shuffled(await fetchMovieLensTitles(), 29);
  movieTitles.forEach((title) => {
    if (words.length < TARGET_COUNTS.moviesSeries) pushUnique(words, seen, title);
  });

  return words.slice(0, TARGET_COUNTS.moviesSeries);
}

async function buildGeneralWords() {
  const words = [];
  const seen = new Set();

  try {
    const html = await fetchText('https://deutschgo.com/en/dictionary/collections/nouns/top1000');
    const sourceWords = [...html.matchAll(/<span lang="de"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g)].map((match) => match[1]);
    sourceWords.forEach((word) => {
      if (words.length < TARGET_COUNTS.general) pushGeneralUnique(words, seen, word);
    });
  } catch (error) {
    console.warn(`DeutschGo general words failed: ${error.message}`);
  }

  if (words.length < TARGET_COUNTS.general) {
    const fallbackUrl = 'https://raw.githubusercontent.com/Jonny-exe/German-Words-Library/master/German-words-5000-words.json';
    const fallbackWords = await fetchJson(fallbackUrl);
    shuffled(fallbackWords, 37).forEach((word) => {
      if (words.length < TARGET_COUNTS.general) pushGeneralUnique(words, seen, word);
    });
  }

  return words.slice(0, TARGET_COUNTS.general);
}

async function buildAnime() {
  const words = [];
  const seen = new Set();
  for (let page = 1; page <= 4; page += 1) {
    const data = await fetchJson(`https://api.jikan.moe/v4/top/anime?limit=25&page=${page}`);
    (data.data || []).forEach((anime) => pushUnique(words, seen, anime.title_english || anime.title));
    await sleep(900);
  }
  ANIME_SEEDS.forEach((anime) => {
    if (words.length < TARGET_COUNTS.anime) pushUnique(words, seen, anime);
  });
  return words.slice(0, TARGET_COUNTS.anime);
}

function assertCount(id, words) {
  const expected = TARGET_COUNTS[id];
  if (words.length !== expected) {
    throw new Error(`${id} has ${words.length} words, expected ${expected}`);
  }
}

async function main() {
  const categories = [
    {
      id: 'footballers',
      label: 'Fußballer',
      words: await buildFootballers()
    },
    {
      id: 'moviesSeries',
      label: 'Filme/Serien',
      words: await buildMoviesSeries()
    },
    {
      id: 'general',
      label: 'Allgemeine Wörter',
      words: await buildGeneralWords()
    },
    {
      id: 'anime',
      label: 'Anime',
      words: await buildAnime()
    }
  ];

  categories.forEach((category) => assertCount(category.id, category.words));

  const data = {
    categories,
    generatedAt: new Date().toISOString(),
    sources: [
      'https://en.wikipedia.org/w/api.php',
      'https://files.grouplens.org/datasets/movielens/ml-latest-small.zip',
      'https://deutschgo.com/en/dictionary/collections/nouns/top1000',
      'https://raw.githubusercontent.com/Jonny-exe/German-Words-Library/master/German-words-5000-words.json',
      'https://api.jikan.moe/v4/top/anime'
    ]
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(data, null, 2)}\n`);
  categories.forEach((category) => {
    console.log(`${category.label}: ${category.words.length}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
