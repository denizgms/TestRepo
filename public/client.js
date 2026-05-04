const socket = io();
const VOTE_ABSTAIN = '__abstain__';
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
const categorySelect = document.getElementById('categorySelect');
const categoryInfo = document.getElementById('categoryInfo');
const messagesList = document.getElementById('messagesList');
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

categorySelect.onchange = async () => {
  const res = await rpc('category:set', { categoryId: categorySelect.value });
  if (!res.ok) showError(res.error);
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
  renderCategorySelect(lobby, me);

  playersList.innerHTML = '';
  lobby.players.forEach((p) => {
    const li = document.createElement('li');
    li.className = p.eliminated ? 'eliminated' : '';
    li.textContent = `${p.name}${p.id === lobby.hostId ? ' (Host)' : ''}${p.eliminated ? ' (raus)' : ''}${p.connected ? '' : ' (offline)'}`;
    playersList.appendChild(li);
  });

  messagesList.innerHTML = '';
  (lobby.messages || []).forEach((message) => {
    const li = document.createElement('li');
    li.textContent = message;
    messagesList.appendChild(li);
  });

  const phaseText = {
    lobby: 'Warte auf Spieler (mind. 4).',
    reveal: 'Sieh dir deine Rolle an und drücke „Bereit“. Danach wird direkt abgestimmt.',
    voting: 'Wählt geheim. Enthalten ist erlaubt; raus fliegt nur jemand mit klarer Mehrheit.',
    result: 'Runde beendet.'
  };
  statusMessage.textContent = phaseText[lobby.phase] || '';

  if (me.eliminated) {
    privateInfo.textContent = 'Du bist raus und kannst in dieser Runde nicht mehr mitspielen.';
  } else {
    privateInfo.textContent = me.role
      ? (me.role === 'imposter' ? `Du bist Imposter. ${me.ownWord}` : `Dein Wort: ${me.ownWord}`)
      : 'Noch keine Rolle zugewiesen.';
  }

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

  if (lobby.phase === 'voting' && !me.voted && !me.eliminated) {
    const select = document.createElement('select');
    const abstain = document.createElement('option');
    abstain.value = VOTE_ABSTAIN;
    abstain.textContent = 'Enthalten';
    select.appendChild(abstain);

    lobby.players.filter((p) => p.id !== me.playerId && !p.eliminated && p.connected).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    const btn = button('Stimme abgeben', async () => {
      const res = await rpc('vote:submit', { targetId: select.value });
      if (!res.ok) showError(res.error);
    });
    controls.append(select, btn);
  }

  if (lobby.phase === 'voting' && me.eliminated) {
    const note = document.createElement('p');
    note.textContent = 'Du bist raus und wartest auf das Ergebnis.';
    controls.appendChild(note);
  }

  if (lobby.phase === 'voting' && lobby.tiePlayers?.length && me.isHost) {
    controls.appendChild(button('Abstimmung neu starten', async () => {
      const res = await rpc('vote:restart');
      if (!res.ok) showError(res.error);
    }));
  }

  if (me.isHost && ['reveal', 'voting'].includes(lobby.phase)) {
    controls.appendChild(button('Runde neu starten', startNewRound));
  }

  if (lobby.phase === 'result') {
    const accused = lobby.players.find((p) => p.id === lobby.result.accused);
    const imposters = lobby.players.filter((p) => lobby.result.imposters.includes(p.id)).map((p) => p.name).join(', ');
    const resultText = document.createElement('p');
    resultText.textContent = `Beschuldigt: ${accused?.name || '-'} | Imposter: ${imposters} | Sieger: ${lobby.result.winner === 'group' ? 'Crew Mates' : 'Imposter-Team'} | ${lobby.result.reason || ''}`;
    controls.appendChild(resultText);

    if (me.isHost) {
      controls.appendChild(button('Neue Runde starten', startNewRound));
    }
  }
}

function renderCategorySelect(lobby, me) {
  const options = lobby.categoryOptions || [];
  categorySelect.innerHTML = '';
  options.forEach((category) => {
    const opt = document.createElement('option');
    opt.value = category.id;
    opt.textContent = `${category.label} (${category.count})`;
    categorySelect.appendChild(opt);
  });

  categorySelect.value = lobby.selectedCategory || 'all';
  categorySelect.disabled = !(me.isHost && ['lobby', 'result'].includes(lobby.phase));

  const selected = options.find((category) => category.id === categorySelect.value);
  categoryInfo.textContent = selected ? `${selected.count} Begriffe verfügbar` : '';
}

function button(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

async function startNewRound() {
  const res = await rpc('game:newRound');
  if (!res.ok) showError(res.error);
}
