const socket = io();
let state = null;

const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const lobbyCodeEl = document.getElementById('lobbyCode');
const phaseLabel = document.getElementById('phaseLabel');
const statusMessage = document.getElementById('statusMessage');
const playersList = document.getElementById('playersList');
const privateInfo = document.getElementById('privateInfo');
const cluesList = document.getElementById('cluesList');
const controls = document.getElementById('controls');

function rpc(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}

function showError(msg) { alert(msg); }

createBtn.onclick = async () => {
  const res = await rpc('lobby:create', { name: nameInput.value });
  if (!res.ok) return showError(res.error);
  joinScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
};

joinBtn.onclick = async () => {
  const res = await rpc('lobby:join', { name: nameInput.value, code: codeInput.value });
  if (!res.ok) return showError(res.error);
  joinScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
};

socket.on('state:update', (newState) => {
  state = newState;
  render();
});

function render() {
  if (!state) return;
  const { lobby, me } = state;

  lobbyCodeEl.textContent = lobby.code;
  phaseLabel.textContent = `Phase: ${lobby.phase}`;

  playersList.innerHTML = '';
  lobby.players.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.id === lobby.hostId ? ' (Host)' : ''}${p.connected ? '' : ' (offline)'}`;
    playersList.appendChild(li);
  });

  cluesList.innerHTML = '';
  lobby.clues.forEach((c) => {
    const li = document.createElement('li');
    li.textContent = `${c.playerName}: ${c.text}`;
    cluesList.appendChild(li);
  });

  const phaseText = {
    lobby: 'Warte auf Spieler (mind. 4).',
    reveal: 'Sieh dir deine Rolle an und drücke „Bereit“.',
    clue: 'Hinweise werden nacheinander abgegeben.',
    discussion: 'Diskutiert jetzt, wer der Imposter sein könnte.',
    voting: 'Wählt geheim, wer der Imposter ist.',
    result: 'Runde beendet.'
  };
  statusMessage.textContent = phaseText[lobby.phase] || '';

  privateInfo.textContent = me.role
    ? (me.role === 'imposter' ? `Du bist Imposter. ${me.ownWord}` : `Dein Wort: ${me.ownWord}`)
    : 'Noch keine Rolle zugewiesen.';

  controls.innerHTML = '';

  if (lobby.phase === 'lobby' && me.isHost) {
    const btn = button('Spiel starten', async () => {
      const res = await rpc('game:start');
      if (!res.ok) showError(res.error);
    });
    if (lobby.players.length < lobby.minPlayers) btn.disabled = true;
    controls.appendChild(btn);
  }

  if (lobby.phase === 'reveal' && !me.ready) {
    controls.appendChild(button('Bereit', async () => {
      const res = await rpc('player:ready');
      if (!res.ok) showError(res.error);
    }));
  }

  if (lobby.phase === 'clue') {
    const currentId = lobby.turnOrder[lobby.currentTurnIndex];
    if (currentId === me.playerId) {
      const input = document.createElement('input');
      input.placeholder = 'Dein Hinweis';
      const btn = button('Hinweis abgeben', async () => {
        const res = await rpc('clue:submit', { text: input.value });
        if (!res.ok) showError(res.error);
      });
      controls.append(input, btn);
    }
  }

  if (lobby.phase === 'discussion' && me.isHost) {
    controls.appendChild(button('Zur Abstimmung', async () => {
      const res = await rpc('discussion:toVoting');
      if (!res.ok) showError(res.error);
    }));
  }

  if (lobby.phase === 'voting' && !me.voted) {
    const select = document.createElement('select');
    lobby.players.filter((p) => p.id !== me.playerId).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    const btn = button('Abstimmen', async () => {
      const res = await rpc('vote:submit', { targetId: select.value });
      if (!res.ok) showError(res.error);
    });
    controls.append(select, btn);
  }

  if (lobby.phase === 'voting' && lobby.tiePlayers?.length && me.isHost) {
    controls.appendChild(button('Abstimmung neu starten', async () => {
      const res = await rpc('vote:restart');
      if (!res.ok) showError(res.error);
    }));
  }

  if (lobby.phase === 'result') {
    const accused = lobby.players.find((p) => p.id === lobby.result.accused);
    const imposters = lobby.players.filter((p) => lobby.result.imposters.includes(p.id)).map((p) => p.name).join(', ');
    const resultText = document.createElement('p');
    resultText.textContent = `Beschuldigt: ${accused?.name || '-'} | Imposter: ${imposters} | Sieger: ${lobby.result.winner === 'group' ? 'Gruppe' : 'Imposter-Team'}`;
    controls.appendChild(resultText);

    if (me.isHost) {
      controls.appendChild(button('Neue Runde starten', async () => {
        const res = await rpc('game:newRound');
        if (!res.ok) showError(res.error);
      }));
    }
  }
}

function button(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}
