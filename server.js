const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 4;

const GAME_CONFIG = {
  imposterWordMode: 'none', // 'none' | 'different'
  imposterMessage: 'Du bist der Imposter. Versuche das Wort zu erraten und unauffällig zu bleiben.',
  allowImposterFinalGuess: true
};

const words = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'words.json'), 'utf-8')
).words;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const lobbies = new Map();

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

function getLobbyPublicState(lobby) {
  return {
    code: lobby.code,
    phase: lobby.phase,
    hostId: lobby.hostId,
    players: lobby.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
    minPlayers: MIN_PLAYERS,
    votesSubmitted: lobby.votesSubmitted,
    voteResults: lobby.voteResults,
    accused: lobby.accused,
    tiePlayers: lobby.tiePlayers,
    result: lobby.result,
    messages: lobby.messages
  };
}

function getPlayerPrivateState(lobby, socketId) {
  const p = lobby.players.find((x) => x.id === socketId);
  if (!p) return null;
  return {
    playerId: p.id,
    name: p.name,
    role: p.role,
    ownWord: p.role === 'imposter' ? p.imposterWord : lobby.secretWord,
    ready: p.ready,
    voted: p.voted,
    isHost: lobby.hostId === p.id
  };
}

function emitLobbyState(code) {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const publicState = getLobbyPublicState(lobby);
  lobby.players.forEach((player) => {
    if (!player.connected) return;
    io.to(player.id).emit('state:update', {
      lobby: publicState,
      me: getPlayerPrivateState(lobby, player.id)
    });
  });
}

function calculateImposterCount(playerCount) {
  return playerCount === 4 ? 1 : 2;
}

function setupRound(lobby) {
  lobby.phase = 'reveal';
  lobby.secretWord = pickRandom(words);
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
    p.imposterWord = GAME_CONFIG.imposterWordMode === 'different' ? pickRandom(words.filter((w) => w !== lobby.secretWord)) : GAME_CONFIG.imposterMessage;
  });
}

function allReady(lobby) {
  return lobby.players.every((p) => p.ready);
}

function startVoting(lobby) {
  lobby.phase = 'voting';
  lobby.votes = {};
  lobby.votesSubmitted = 0;
  lobby.voteResults = null;
  lobby.tiePlayers = [];
  lobby.players.forEach((p) => (p.voted = false));
}

function resolveVotes(lobby) {
  const tally = {};
  Object.values(lobby.votes).forEach((targetId) => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return;

  const topVotes = sorted[0][1];
  const tied = sorted.filter(([, v]) => v === topVotes).map(([id]) => id);

  lobby.voteResults = tally;
  if (tied.length > 1) {
    lobby.tiePlayers = tied;
    lobby.phase = 'voting';
    lobby.messages.push('Es gab ein Unentschieden. Host kann neu abstimmen oder auflösen.');
    return;
  }

  lobby.accused = tied[0];
  const imposters = lobby.players.filter((p) => p.role === 'imposter').map((p) => p.id);
  const caught = imposters.includes(lobby.accused);

  lobby.result = {
    imposters,
    accused: lobby.accused,
    caught,
    winner: caught ? 'group' : 'imposters',
    finalGuessEnabled: GAME_CONFIG.allowImposterFinalGuess && caught
  };

  if (imposters.length === 2 && caught) {
    lobby.result.groupWinByRule = 'Mindestens ein Imposter wurde erwischt.';
  }

  lobby.phase = 'result';
}

io.on('connection', (socket) => {
  socket.on('lobby:create', ({ name }, cb) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return cb({ ok: false, error: 'Name darf nicht leer sein.' });

    const code = generateCode();
    const lobby = {
      code,
      hostId: socket.id,
      phase: 'lobby',
      players: [{ id: socket.id, name: trimmed, connected: true, role: null, ready: false, voted: false }],
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
    cb({ ok: true, code });
    emitLobbyState(code);
  });

  socket.on('lobby:join', ({ name, code }, cb) => {
    const trimmed = (name || '').trim();
    const cleanCode = (code || '').trim().toUpperCase();
    const lobby = lobbies.get(cleanCode);
    if (!trimmed) return cb({ ok: false, error: 'Name darf nicht leer sein.' });
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return cb({ ok: false, error: 'Name bereits vergeben.' });
    }

    lobby.players.push({ id: socket.id, name: trimmed, connected: true, role: null, ready: false, voted: false });
    socket.join(cleanCode);
    socket.data.lobbyCode = cleanCode;
    cb({ ok: true, code: cleanCode });
    emitLobbyState(cleanCode);
  });

  socket.on('game:start', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.id) return cb({ ok: false, error: 'Nur der Host kann starten.' });
    if (lobby.players.length < MIN_PLAYERS) return cb({ ok: false, error: `Mindestens ${MIN_PLAYERS} Spieler nötig.` });
    setupRound(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('player:ready', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'reveal') return cb({ ok: false, error: 'Nicht in Reveal-Phase.' });
    const p = lobby.players.find((x) => x.id === socket.id);
    if (!p) return cb({ ok: false, error: 'Spieler nicht gefunden.' });
    p.ready = true;
    if (allReady(lobby)) startVoting(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('vote:submit', ({ targetId }, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'voting') return cb({ ok: false, error: 'Nicht in Abstimmung.' });
    if (targetId === socket.id) return cb({ ok: false, error: 'Du kannst nicht dich selbst wählen.' });
    if (!lobby.players.some((p) => p.id === targetId)) return cb({ ok: false, error: 'Ungültige Stimme.' });

    const voter = lobby.players.find((p) => p.id === socket.id);
    if (!voter) return cb({ ok: false, error: 'Spieler nicht gefunden.' });
    if (!voter.voted) lobby.votesSubmitted += 1;

    lobby.votes[socket.id] = targetId;
    voter.voted = true;

    if (lobby.votesSubmitted === lobby.players.length) resolveVotes(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('vote:restart', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby || lobby.phase !== 'voting') return cb({ ok: false, error: 'Nicht in Abstimmung.' });
    if (lobby.hostId !== socket.id) return cb({ ok: false, error: 'Nur Host.' });
    startVoting(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('game:newRound', (_, cb) => {
    const lobby = lobbies.get(socket.data.lobbyCode);
    if (!lobby) return cb({ ok: false, error: 'Lobby nicht gefunden.' });
    if (lobby.hostId !== socket.id) return cb({ ok: false, error: 'Nur Host.' });
    setupRound(lobby);
    cb({ ok: true });
    emitLobbyState(lobby.code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.lobbyCode;
    if (!code) return;
    const lobby = lobbies.get(code);
    if (!lobby) return;

    const playerIndex = lobby.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1) return;

    if (lobby.phase === 'lobby') {
      lobby.players.splice(playerIndex, 1);
    } else {
      lobby.players[playerIndex].connected = false;
      lobby.messages.push(`${lobby.players[playerIndex].name} hat die Verbindung verloren.`);
    }

    if (lobby.hostId === socket.id) {
      const newHost = lobby.players.find((p) => p.connected);
      lobby.hostId = newHost ? newHost.id : null;
      if (newHost) lobby.messages.push(`${newHost.name} ist jetzt Host.`);
    }

    if (!lobby.players.some((p) => p.connected)) {
      lobbies.delete(code);
    } else {
      emitLobbyState(code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
