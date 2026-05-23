const TOPICS = [
  { id: 'all',           label: 'Tutti' },
  { id: 'cinematica',    label: 'Cinematica' },
  { id: 'dinamica',      label: 'Dinamica' },
  { id: 'fluidi',        label: 'Fluidi' },
  { id: 'termodinamica', label: 'Termodinamica' },
  { id: 'ottica',        label: 'Ottica' },
  { id: 'onde',          label: 'Onde' },
  { id: 'astronomia',        label: 'Astronomia' },
  { id: 'elettromagnetismo', label: 'Elettromagnetismo' },
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
    id: 'celestial',
    name: 'Moti Celesti',
    desc: 'Simula il problema dei due corpi con la gravità newtoniana. Scegli masse, velocità e direzione per ottenere orbite circolari, ellittiche, paraboliche o iperboliche.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🪐',
    url: 'labs/celestial/',
  },
  {
    id: 'solar-system',
    name: 'Sistema Solare',
    desc: 'Esplora i dati di pianeti, satelliti e pianeti nani. Confronta dimensioni in scala e distanze orbitali.',
    topic: 'astronomia',
    status: 'beta',
    icon: '🌍',
    url: 'labs/solar-system/',
  },
  {
    id: 'black-hole',
    name: 'Buco Nero',
    desc: 'Esplora la fisica dei buchi neri di Schwarzschild in due modalità: lente gravitazionale con ray tracing dei fotoni e geodetiche relativistiche con potenziale effettivo.',
    topic: 'astronomia',
    status: 'beta',
    icon: '🕳️',
    url: 'labs/black-hole/',
  },
  {
    id: 'inclined-plane',
    name: 'Piano Inclinato',
    desc: 'Esplora equilibrio e moto su piano inclinato. Varia l\'angolo, la massa e il coefficiente di attrito. Visualizza le forze in gioco.',
    topic: 'dinamica',
    status: 'stable',
    icon: '📐',
    url: 'labs/inclined-plane/',
  },
  {
    id: 'spring',
    name: 'Forza Elastica',
    desc: 'Studia il moto oscillatorio di una massa appesa a una molla. Regola costante elastica, lunghezza naturale e massa. Visualizza i vettori forza e i grafici x(t) e v(t).',
    topic: 'dinamica',
    status: 'stable',
    icon: '🌀',
    url: 'labs/spring/',
  },
  {
    id: 'ballistic-pendulum',
    name: 'Pendolo Balistico',
    desc: 'Studia la conservazione della quantità di moto: un proiettile si conficca in un pendolo balistico e ne misura la velocità dall\'angolo di oscillazione. Confronta l\'energia cinetica prima e dopo l\'urto.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎯',
    url: 'labs/ballistic-pendulum/',
  },
  {
    id: 'collisions',
    name: 'Urti',
    desc: 'Studia gli urti rettilinei e obliqui tra due corpi. Scegli urto elastico, anelastico o perfettamente anelastico. Varia masse, velocità iniziali e angolo di impatto. Confronta energia cinetica e quantità di moto prima e dopo l\'urto.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎱',
    url: 'labs/collisions/',
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
    id: 'venturi',
    name: 'Effetto Venturi',
    desc: 'Esplora la relazione tra velocità e pressione in un fluido in moto attraverso un tubo di Venturi. Osserva la caduta di pressione nella strozzatura e verifica che P + ½ρv² rimanga costante.',
    topic: 'fluidi',
    status: 'stable',
    icon: '💨',
    url: 'labs/venturi/',
  },
  {
    id: 'bernoulli',
    name: 'Equazione di Bernoulli',
    desc: 'Studia l\'equazione di Bernoulli in un tubo con due sezioni a quote diverse. Varia raggi, altezze, velocità e pressione e osserva come la conservazione dell\'energia governa il flusso.',
    topic: 'fluidi',
    status: 'stable',
    icon: '🌊',
    url: 'labs/bernoulli/',
  },
  {
    id: 'gas',
    name: 'Leggi dei Gas',
    desc: 'Esplora le trasformazioni isobare, isocore e isoterme di un gas ideale. Visualizza P-V, V-T e P-T e calcola lavoro, calore e variazione di energia interna.',
    topic: 'termodinamica',
    status: 'stable',
    icon: '⚗️',
    url: 'labs/gas/',
  },
  {
    id: 'cammino-libero',
    name: 'Cammino Libero Medio',
    desc: 'Simula un gas molecolare 2D con collisioni elastiche. Misura la distribuzione dei cammini liberi e confrontala con la legge esponenziale teorica. Osserva la distribuzione di Maxwell-Boltzmann delle velocità emergere dalle collisioni.',
    topic: 'termodinamica',
    status: 'beta',
    icon: '⚛️',
    url: 'labs/cammino-libero/',
  },
  {
    id: 'carnot',
    name: 'Ciclo di Carnot',
    desc: 'Visualizza il ciclo termodinamico di Carnot su un diagramma P-V e calcola l\'efficienza della macchina.',
    topic: 'termodinamica',
    status: 'stable',
    icon: '🌡️',
    url: 'labs/carnot/',
  },
  {
    id: 'color-synthesis',
    name: 'Sintesi del Colore',
    desc: 'Esplora la sintesi additiva (RGB, luce) e sottrattiva (CMY, pigmenti) del colore. Varia l\'intensità di ciascun primario e osserva i colori misti nelle zone di sovrapposizione.',
    topic: 'ottica',
    status: 'stable',
    icon: '🎨',
    url: 'labs/color-synthesis/',
  },
  {
    id: 'geometric-optics',
    name: 'Ottica Geometrica — Lenti',
    desc: 'Esplora la formazione delle immagini attraverso lenti convergenti e divergenti. Studia i sei tipi di lente con ray tracing paraxiale, regola curvature, indice di rifrazione e posizione dell\'oggetto.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔭',
    url: 'labs/geometric-optics/',
  },
  {
    id: 'eye',
    name: 'L\'Occhio Umano',
    desc: 'Esplora la formazione delle immagini nell\'occhio. Simula miopia, ipermetropia e astigmatismo, varia le diottrie del difetto e posiziona una lente correttiva per simulare occhiali o lenti a contatto.',
    topic: 'ottica',
    status: 'beta',
    icon: '👁️',
    url: 'labs/eye/',
  },
  {
    id: 'refraction',
    name: 'Rifrazione della Luce',
    desc: 'Esplora la legge di Snell al variare degli indici di rifrazione e dell\'angolo di incidenza. Visualizza la dispersione cromatica con la legge di Cauchy.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔬',
    url: 'labs/refraction/',
  },
  {
    id: 'prism',
    name: 'Prisma Ottico',
    desc: 'Studia la rifrazione e la dispersione della luce attraverso prismi di diversa forma. Osserva la separazione spettrale con la legge di Cauchy.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔷',
    url: 'labs/prism/',
  },
  {
    id: 'diffraction',
    name: 'Interferenza e Diffrazione',
    desc: 'Studia la diffrazione di Fraunhofer con fenditura singola, doppia, tripla e reticolo. Visualizza lo schema ottico e il pattern sullo schermo con luce monocromatica o bianca.',
    topic: 'onde',
    status: 'stable',
    icon: '〰️',
    url: 'labs/diffraction/',
  },
  {
    id: 'standing-waves',
    name: 'Onde Stazionarie',
    desc: 'Visualizza onde stazionarie su corda fissata o tubo risonante. Esplora armoniche, nodi e ventri al variare di frequenza, lunghezza e tensione.',
    topic: 'onde',
    status: 'stable',
    icon: '〰️',
    url: 'labs/standing-waves/',
  },
  {
    id: 'em-field',
    name: 'Campo Elettrico',
    desc: 'Visualizza il campo elettrico e il potenziale di monopoli, dipoli, quadrupoli e multipoli superiori. Trascina la sonda per misurare V ed E in ogni punto, e le cariche per riposizionarle.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⚡',
    url: 'labs/em-field/',
  },
  {
    id: 'ondoscopio',
    name: 'Ondoscopio',
    desc: 'Simula onde su una vasca con equazione delle onde 2D. Varia frequenza e ampiezza, posiziona sorgenti singole o doppie, aggiungi ostacoli e fenditure, osserva diffrazione e interferenza con oggetti flottanti.',
    topic: 'onde',
    status: 'beta',
    icon: '🌊',
    url: 'labs/ondoscopio/',
  },
  {
    id: 'correnti',
    name: 'Campi da Correnti',
    desc: 'Visualizza il campo magnetico di filo infinito, spira circolare/quadrata, solenoide e toroide. Biot-Savart in 3D con piano di taglio colorato e linee di campo interattive.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔌',
    url: 'labs/correnti/',
  },
  {
    id: 'mag-field',
    name: 'Campo Magnetico',
    desc: 'Visualizza il campo magnetico generato da magneti permanenti. Trascina i magneti, ruotali con lo scroll del mouse. Osserva linee di campo, mappa di calore e pattern di limatura di ferro.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🧲',
    url: 'labs/mag-field/',
  },
  {
    id: 'battimenti',
    name: 'Battimenti',
    desc: 'Sovrapponi due onde sinusoidali di frequenze vicine e osserva i battimenti. Varia ampiezze e frequenze, ascolta il suono risultante e studia inviluppo e frequenza di battimento.',
    topic: 'onde',
    status: 'stable',
    icon: '🎵',
    url: 'labs/battimenti/',
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
