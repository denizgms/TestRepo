const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 3;
const CATEGORY_ALL = 'all';
const VOTE_ABSTAIN = '__abstain__';

const GAME_CONFIG = {
  imposterWordMode: 'none', // 'none' | 'different'
  imposterMessage: 'Du bist der Imposter. Versuche das Wort zu erraten und unauffällig zu bleiben.'
};

const wordData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'words.json'), 'utf-8')
);

function uniqueWords(words) {
  const seen = new Set();
  return words.filter((word) => {
    const key = String(word).trim().toLocaleLowerCase('de-DE');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeWordCategories(data) {
  if (Array.isArray(data.categories)) {
    return data.categories.map((category) => ({
      id: category.id,
      label: category.label,
      words: uniqueWords(category.words || [])
    })).filter((category) => category.id && category.label && category.words.length);
  }

  if (Array.isArray(data.words)) {
    return [{ id: 'general', label: 'Allgemeine Wörter', words: uniqueWords(data.words) }];
  }

  throw new Error('data/words.json muss entweder categories oder words enthalten.');
}

const wordCategories = normalizeWordCategories(wordData);
const allCategoryWords = uniqueWords(wordCategories.flatMap((category) => category.words));
const categoryOptions = [
  { id: CATEGORY_ALL, label: 'Alle Kategorien', count: allCategoryWords.length },
  ...wordCategories.map((category) => ({ id: category.id, label: category.label, count: category.words.length }))
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const indexFile = path.join(__dirname, 'public', 'index.html');
const LOBBY_CLEANUP_DELAY = 5 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/lobby/:code', (req, res) => {
  res.sendFile(indexFile);
});

const lobbies = new Map();

function normalizeClientId(clientId, fallback) {
  const cleanId = String(clientId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return cleanId || fallback;
}

function createPlayer({ id, socketId, name }) {
  return {
    id,
    socketId,
    name,
    connected: true,
    role: null,
    ready: false,
    voted: false,
    eliminated: false
  };
}

function clearLobbyCleanup(lobby) {
  if (!lobby.cleanupTimer) return;
  clearTimeout(lobby.cleanupTimer);
  lobby.cleanupTimer = null;
}

function scheduleLobbyCleanup(lobby) {
  if (lobby.cleanupTimer) return;
  lobby.cleanupTimer = setTimeout(() => {
    const currentLobby = lobbies.get(lobby.code);
    if (currentLobby && !currentLobby.players.some((p) => p.connected)) {
      lobbies.delete(lobby.code);
    }
  }, LOBBY_CLEANUP_DELAY);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (lobbies.has(code));
  return code;
}

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

function resolveCategoryId(categoryId) {
  if (categoryId === CATEGORY_ALL || wordCategories.some((category) => category.id === categoryId)) {
    return categoryId;
  }
  return CATEGORY_ALL;
}

function getCategoryOption(categoryId) {
  return categoryOptions.find((category) => category.id === resolveCategoryId(categoryId)) || categoryOptions[0];
}

function getWordsForCategory(categoryId) {
  const resolvedCategoryId = resolveCategoryId(categoryId);
  if (resolvedCategoryId === CATEGORY_ALL) return allCategoryWords;
  return wordCategories.find((category) => category.id === resolvedCategoryId).words;
}

function canNewPlayersJoin(lobby) {
  return lobby.phase === 'lobby';
}

function getLobbyPublicState(lobby) {
  const selectedCategory = getCategoryOption(lobby.selectedCategory);
  return {
    code: lobby.code,
    phase: lobby.phase,
    hostId: lobby.hostId,
    players: lobby.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, eliminated: p.eliminated })),
    minPlayers: MIN_PLAYERS,
    selectedCategory: selectedCategory.id,
    selectedCategoryLabel: selectedCategory.label,
    categoryOptions,
    votesSubmitted: lobby.votesSubmitted,
    voteResults: lobby.voteResults,
    accused: lobby.accused,
    tiePlayers: lobby.tiePlayers,
    result: lobby.result,
    messages: lobby.messages
  };
}

function getPlayerPrivateState(lobby, playerId) {
  const p = lobby.players.find((x) => x.id === playerId);
  if (!p) return null;
  return {
    playerId: p.id,
    name: p.name,
    role: p.role,
    ownWord: p.role === 'imposter' ? p.imposterWord : lobby.secretWord,
    ready: p.ready,
    voted: p.voted,
    eliminated: p.eliminated,
    isHost: lobby.hostId === p.id
  };
}

function emitLobbyState(code) {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const publicState = getLobbyPublicState(lobby);
  lobby.players.forEach((player) => {
    if (!player.connected) return;
    io.to(player.socketId).emit('state:update', {
      lobby: publicState,
      me: getPlayerPrivateState(lobby, player.id)
    });
  });
}

function calculateImposterCount(playerCount) {
  return playerCount >= 7 ? 2 : 1;
}

function getActivePlayers(lobby) {
  return lobby.players.filter((p) => p.connected && !p.eliminated);
}

function getActiveRoleCounts(lobby) {
  const activePlayers = getActivePlayers(lobby);
  return {
    imposters: activePlayers.filter((p) => p.role === 'imposter').length,
    crew: activePlayers.filter((p) => p.role === 'citizen').length
  };
}

function resetLobbyForPlayers(lobby) {
  lobby.phase = 'lobby';
  lobby.secretWord = null;
  lobby.votes = {};
  lobby.voteResults = null;
  lobby.votesSubmitted = 0;
  lobby.accused = null;
  lobby.tiePlayers = [];
  lobby.result = null;
  lobby.messages = [];
  lobby.players = lobby.players.filter((p) => p.connected);

  lobby.players.forEach((p) => {
    p.role = null;
    p.ready = false;
    p.voted = false;
    p.eliminated = false;
    p.imposterWord = null;
  });
}

function setupRound(lobby) {
  lobby.players = lobby.players.filter((p) => p.connected);
  const roundWords = getWordsForCategory(lobby.selectedCategory);
  lobby.phase = 'reveal';
  lobby.secretWord = pickRandom(roundWords);
  lobby.votes = {};
  lobby.voteResults = null;
  lobby.votesSubmitted = 0;
  lobby.accused = null;
  lobby.tiePlayers = [];
  lobby.result = null;
  lobby.messages = [];

  const imposterCount = calculateImposterCount(lobby.players.length);
  const shuffledPlayers = shuffle(lobby.players);
  const imposterIds = new Set(shuffledPlayers.slice(0, imposterCount).map((p) => p.id));

  lobby.players.forEach((p) => {
    p.role = imposterIds.has(p.id) ? 'imposter' : 'citizen';
    p.ready = false;
    p.voted = false;
    p.eliminated = false;
    p.imposterWord = GAME_CONFIG.imposterWordMode === 'different' ? pickRandom(roundWords.filter((w) => w !== lobby.secretWord)) : GAME_CONFIG.imposterMessage;
  });
}

function allReady(lobby) {
  return getActivePlayers(lobby).every((p) => p.ready);
}

function startVoting(lobby) {
  lobby.phase = 'voting';
  lobby.votes = {};
  lobby.votesSubmitted = 0;
  lobby.voteResults = null;
  lobby.accused = null;
  lobby.tiePlayers = [];
  lobby.players.forEach((p) => {
    p.voted = false;
  });
}

function resolveVotes(lobby) {
  const activePlayers = getActivePlayers(lobby);
  const tally = {};
  let abstentions = 0;
  Object.values(lobby.votes).forEach((targetId) => {
    if (targetId === VOTE_ABSTAIN) {
      abstentions += 1;
      return;
    }
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const topVotes = sorted[0]?.[1] || 0;
  const majorityNeeded = Math.floor(activePlayers.length / 2) + 1;

  lobby.voteResults = { ...tally, [VOTE_ABSTAIN]: abstentions };
  if (topVotes < majorityNeeded) {
    lobby.messages.push(`Keine klare Mehrheit (${topVotes}/${activePlayers.length}). Abstimmung startet neu.`);
    startVoting(lobby);
    return;
  }

  const accused = lobby.players.find((p) => p.id === sorted[0][0]);
  if (!accused || accused.eliminated) return;

  lobby.accused = accused.id;
  const imposters = lobby.players.filter((p) => p.role === 'imposter').map((p) => p.id);
  const caught = accused.role === 'imposter';
  accused.eliminated = true;

  if (caught) {
    const { imposters: activeImposters, crew: activeCrew } = getActiveRoleCounts(lobby);
    lobby.messages.push(`${accused.name} war Imposter und ist raus.`);

    if (activeImposters > 0) {
      lobby.messages.push(`Es bleiben ${activeImposters} Imposter und ${activeCrew} Crew Mates im Spiel.`);
      startVoting(lobby);
      return;
    }

    lobby.result = {
      imposters,
      accused: accused.id,
      caught: true,
      winner: 'group',
      reason: `${accused.name} war der letzte Imposter.`
    };
    lobby.phase = 'result';
    return;
  }

  const { imposters: activeImposters, crew: activeCrew } = getActiveRoleCounts(lobby);
  lobby.messages.push(`${accused.name} wurde rausgewählt und spielt nicht mehr mit.`);

  if (activeImposters >= activeCrew) {
    lobby.result = {
      imposters,
      accused: accused.id,
      caught: false,
      winner: 'imposters',
      reason: `Es sind gleich viele Imposter wie Crew Mates übrig (${activeImposters}:${activeCrew}).`
    };
    lobby.phase = 'result';
    return;
  }

  lobby.messages.push(`Es bleiben ${activeImposters} Imposter und ${activeCrew} Crew Mates im Spiel.`);
  startVoting(lobby);
}

io.on('connection', (socket) => {
  socket.on('lobby:create', ({ name, clientId }, cb) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return cb({ ok: false, error: 'Name darf nicht leer sein.' });

    const code = generateCode();
    const playerId = normalizeClientId(clientId, socket.id);
    const lobby = {
      code,
      hostId: playerId,
      phase: 'lobby',
      selectedCategory: CATEGORY_ALL,
      players: [createPlayer({ id: playerId, socketId: socket.id, name: trimmed })],
      votes: {},
      votesSubmitted: 0,
      voteResults: null,
      accused: null,
      tiePlayers: [],
      result: null,
      messages: []
    };
    lobbies.set(code, lobby);
    socket.join(code);
    socket.data.lobbyCode = code;
    socket.data.playerId = playerId;
    cb({ ok: true, code });
    emitLobbyState(code);
  });

  socket.on('lobby:join', ({ name, code, clientId }, cb) => {
    const trimmed = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();
    const lobby = lobbies.get(cleanCode);
    const playerId = normalizeClientId(clientId, socket.id);
    if (!trimmed) return cb({ ok: false, error: 'Name darf nicht leer sein.' });
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (!canNewPlayersJoin(lobby)) {
      return cb({ ok: false, error: 'Das Spiel wurde bereits gestartet. Neue Spieler können nicht mehr beitreten.' });
    }
    if (lobby.players.some((p) => p.id !== playerId && p.name.toLowerCase() === trimmed.toLowerCase())) {
      return cb({ ok: false, error: 'Name bereits vergeben.' });
    }

    const existingPlayer = lobby.players.find((p) => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.name = trimmed;
      existingPlayer.connected = true;
    } else {
      lobby.players.push(createPlayer({ id: playerId, socketId: socket.id, name: trimmed }));
    }
    clearLobbyCleanup(lobby);
    socket.join(cleanCode);
    socket.data.lobbyCode = cleanCode;
    socket.data.playerId = playerId;
    cb({ ok: true, code: cleanCode });
    emitLobbyState(cleanCode);
  });

  socket.on('lobby:rejoin', ({ name, code, clientId }, cb) => {
    const trimmed = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();
    const lobby = lobbies.get(cleanCode);
    const playerId = normalizeClientId(clientId, socket.id);
    if (!trimmed) return cb({ ok: false, error: 'Name darf nicht leer sein.' });
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });

    let player = lobby.players.find((p) => p.id === playerId);
    if (!player && canNewPlayersJoin(lobby)) {
      player = createPlayer({ id: playerId, socketId: socket.id, name: trimmed });
      lobby.players.push(player);
    }
    if (!player) {
      return cb({ ok: false, error: 'Das Spiel wurde bereits gestartet. Neue Spieler können nicht mehr beitreten.' });
    }

    player.socketId = socket.id;
    player.name = trimmed;
    player.connected = true;
    clearLobbyCleanup(lobby);
    socket.join(cleanCode);
    socket.data.lobbyCode = cleanCode;
    socket.data.playerId = player.id;
    cb({ ok: true, code: cleanCode });
    emitLobbyState(cleanCode);
  });

  socket.on('category:set', ({ categoryId }, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.data.playerId) return cb({ ok: false, error: 'Nur der Host kann die Wortliste ändern.' });
    if (!['lobby', 'result'].includes(lobby.phase)) {
      return cb({ ok: false, error: 'Wortliste kann nur vor einer Runde geändert werden.' });
    }
    lobby.selectedCategory = resolveCategoryId(categoryId);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('game:start', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.data.playerId) return cb({ ok: false, error: 'Nur der Host kann starten.' });
    if (lobby.players.filter((p) => p.connected).length < MIN_PLAYERS) return cb({ ok: false, error: `Mindestens ${MIN_PLAYERS} Spieler nötig.` });
    setupRound(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('player:ready', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'reveal') return cb({ ok: false, error: 'Nicht in Reveal-Phase.' });
    const p = lobby.players.find((x) => x.id === socket.data.playerId);
    if (!p) return cb({ ok: false, error: 'Spieler nicht gefunden.' });
    p.ready = true;
    if (allReady(lobby)) startVoting(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('vote:submit', ({ targetId }, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'voting') return cb({ ok: false, error: 'Nicht in Abstimmung.' });
    const voteTargetId = targetId || VOTE_ABSTAIN;

    const voter = lobby.players.find((p) => p.id === socket.data.playerId);
    if (!voter) return cb({ ok: false, error: 'Spieler nicht gefunden.' });
    if (voteTargetId === voter.id) return cb({ ok: false, error: 'Du kannst nicht dich selbst wählen.' });
    if (voter.eliminated) return cb({ ok: false, error: 'Du bist raus und kannst nicht mehr abstimmen.' });
    if (!voter.connected) return cb({ ok: false, error: 'Spieler nicht verbunden.' });

    if (voteTargetId !== VOTE_ABSTAIN) {
      const target = lobby.players.find((p) => p.id === voteTargetId);
      if (!target || target.eliminated || !target.connected) return cb({ ok: false, error: 'Ungültige Stimme.' });
    }

    if (!voter.voted) lobby.votesSubmitted += 1;

    lobby.votes[voter.id] = voteTargetId;
    voter.voted = true;

    if (lobby.votesSubmitted === getActivePlayers(lobby).length) resolveVotes(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('vote:restart', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'voting') return cb({ ok: false, error: 'Nicht in Abstimmung.' });
    if (lobby.hostId !== socket.data.playerId) return cb({ ok: false, error: 'Nur Host.' });
    startVoting(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('game:newRound', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.data.playerId) return cb({ ok: false, error: 'Nur Host.' });
    setupRound(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('game:end', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.data.playerId) return cb({ ok: false, error: 'Nur Host.' });
    resetLobbyForPlayers(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.lobbyCode;
    const playerId = socket.data.playerId;
    if (!code) return;
    const lobby = lobbies.get(code);
    if (!lobby) return;

    const playerIndex = lobby.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    const player = lobby.players[playerIndex];
    if (player.socketId !== socket.id) return;

    player.connected = false;
    lobby.messages.push(`${player.name} hat die Verbindung verloren.`);

    if (!lobby.players.some((p) => p.connected)) {
      scheduleLobbyCleanup(lobby);
    } else {
      emitLobbyState(code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
