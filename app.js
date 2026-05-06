const TOPICS = [
  { id: 'all',           label: 'Tutti' },
  { id: 'cinematica',    label: 'Cinematica' },
  { id: 'dinamica',      label: 'Dinamica' },
  { id: 'fluidi',        label: 'Fluidi' },
  { id: 'termodinamica', label: 'Termodinamica' },
  { id: 'ottica',        label: 'Ottica' },
  { id: 'onde',          label: 'Onde' },
];

const LABS = [
  {
    id: 'free-fall',
    name: 'Caduta Libera',
    desc: 'Studia il moto di un corpo in caduta, con o senza resistenza dell\'aria. Confronta gravità su pianeti diversi.',
    topic: 'cinematica',
    status: 'stable',
    icon: '🪨',
    url: 'labs/free-fall/',
  },
  {
    id: 'projectile',
    name: 'Moto del Proiettile',
    desc: 'Analizza la traiettoria parabolica di un proiettile al variare di angolo, velocità iniziale e gravità.',
    topic: 'cinematica',
    status: 'stable',
    icon: '🎯',
    url: 'labs/projectile/',
  },
  {
    id: 'pendulum',
    name: 'Pendolo Semplice',
    desc: 'Osserva il moto oscillatorio di un pendolo e misura il periodo in funzione della lunghezza e dell\'angolo.',
    topic: 'dinamica',
    status: 'stable',
    icon: '⚖️',
    url: 'labs/pendulum/',
  },
  {
    id: 'double-pendulum',
    name: 'Pendolo Doppio',
    desc: 'Esplora il caos deterministico del pendolo doppio. Regola lunghezze, masse e angoli e osserva la traiettoria dei due estremi.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎡',
    url: 'labs/double-pendulum/',
  },
  {
    id: 'inclined-plane',
    name: 'Piano Inclinato',
    desc: 'Esplora equilibrio e moto su piano inclinato. Varia l\'angolo, la massa e il coefficiente di attrito.',
    topic: 'dinamica',
    status: 'soon',
    icon: '📐',
    url: null,
  },
  {
    id: 'communicating-vessels',
    name: 'Vasi Comunicanti',
    desc: 'Visualizza il principio dei vasi comunicanti con fluidi di densità diverse e geometrie variabili.',
    topic: 'fluidi',
    status: 'soon',
    icon: '🧪',
    url: null,
  },
  {
    id: 'bernoulli',
    name: 'Effetto Bernoulli',
    desc: 'Esplora la relazione tra velocità e pressione in un fluido in moto attraverso sezioni variabili.',
    topic: 'fluidi',
    status: 'soon',
    icon: '💨',
    url: null,
  },
  {
    id: 'carnot',
    name: 'Ciclo di Carnot',
    desc: 'Visualizza il ciclo termodinamico di Carnot su un diagramma P-V e calcola l\'efficienza della macchina.',
    topic: 'termodinamica',
    status: 'soon',
    icon: '🌡️',
    url: null,
  },
  {
    id: 'refraction',
    name: 'Rifrazione della Luce',
    desc: 'Esplora la legge di Snell alla variare degli indici di rifrazione e dell\'angolo di incidenza.',
    topic: 'ottica',
    status: 'soon',
    icon: '🔬',
    url: null,
  },
  {
    id: 'standing-waves',
    name: 'Onde Stazionarie',
    desc: 'Genera e osserva onde stazionarie su una corda tesa. Misura frequenze e armoniche.',
    topic: 'onde',
    status: 'soon',
    icon: '〰️',
    url: null,
  },
];

let activeFilter = 'all';

function renderFilters() {
  const container = document.getElementById('filters');
  TOPICS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'filter-pill' + (t.id === activeFilter ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.filter = t.id;
    btn.addEventListener('click', () => {
      activeFilter = t.id;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      filterCards();
    });
    container.appendChild(btn);
  });
}

function filterCards() {
  const cards = document.querySelectorAll('.app-card');
  let visible = 0;
  cards.forEach(card => {
    const match = activeFilter === 'all' || card.dataset.topic === activeFilter;
    card.classList.toggle('hidden', !match);
    if (match) visible++;
  });

  let empty = document.querySelector('.empty-state');
  if (visible === 0) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nessun esperimento in questa categoria.';
      document.getElementById('appGrid').appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}

function renderCards() {
  const grid = document.getElementById('appGrid');
  LABS.forEach(lab => {
    const card = document.createElement(lab.url ? 'a' : 'div');
    if (lab.url) card.href = lab.url;
    card.className = 'app-card';
    card.dataset.topic = lab.topic;
    card.dataset.status = lab.status;

    const statusLabel = { stable: 'Stabile', beta: 'Beta', soon: 'Presto' }[lab.status];
    const statusDot = lab.status !== 'soon' ? `<span class="status-dot"></span>` : '';

    card.innerHTML = `
      <div class="card-top">
        <div class="app-icon"><span class="icon-emoji">${lab.icon}</span></div>
        <div class="card-badges">
          <span class="tag tag-${lab.topic}">${TOPICS.find(t => t.id === lab.topic)?.label}</span>
          <span class="tag tag-${lab.status}">${statusDot}${statusLabel}</span>
        </div>
      </div>
      <div class="app-name">${lab.name}</div>
      <div class="app-desc">${lab.desc}</div>
      <div class="card-footer">
        <span class="app-url">${lab.url ? 'labs/' + lab.id + '/' : '— prossimamente'}</span>
        ${lab.url ? '<span class="card-arrow">→</span>' : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function initTheme() {
  const stored = localStorage.getItem('gl-theme') || 'dark';
  document.documentElement.dataset.theme = stored;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('gl-theme', next);
  });
}

renderFilters();
renderCards();
initTheme();
