// Cornici orizzontali ruotate lungo un asse verticale.
// Ogni livello potrà in seguito ospitare un'immagine o un contenuto.
const svg = document.querySelector('#spazio');
const gruppo = document.querySelector('#cornici');
const apertura = document.querySelector('#apertura');
const valore = document.querySelector('#valore');
const pausa = document.querySelector('#pausa');
const NS = 'http://www.w3.org/2000/svg';
const numeroCornici = 36;
const viste = { prospetto: 0, alto: 90, prospettiva: 18 };
let vista = 'prospettiva';
let rotazione = -0.12;
let inclinazione = viste[vista];
let selezionata = 18;
let animazione = false;
let ultimoTempo = 0;
let trascinamento = null;
let mosso = false;
let interno = false;
const camera = { x: 0, y: -13, z: 0, yaw: 0, pitch: -0.65 };
const tasti = new Set();
const mappa = document.querySelector('#mappa');
const quota = document.querySelector('#quota');
const entra = document.querySelector('#entra');

function elemento(nome, attributi) {
  const nodo = document.createElementNS(NS, nome);
  for (const [chiave, valore] of Object.entries(attributi)) nodo.setAttribute(chiave, valore);
  return nodo;
}

const cornici = Array.from({ length: numeroCornici }, (_, indice) => {
  const gruppoCornice = elemento('g', {});
  const poligono = elemento('polygon', {
    class: 'cornice', tabindex: '0', role: 'button',
    'aria-label': `Select frame ${indice + 1}`
  });
  const numero = elemento('text', { class: 'numero' });
  numero.textContent = String(indice + 1).padStart(2, '0');
  gruppoCornice.append(poligono, numero);
  gruppo.append(gruppoCornice);
  function seleziona() { selezionata = indice; disegna(); }
  poligono.addEventListener('click', () => { if (!mosso) seleziona(); });
  poligono.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault(); seleziona();
    }
  });
  return { gruppo: gruppoCornice, poligono, numero };
});

function vertici(indice) {
  const t = indice / (numeroCornici - 1);
  const forma = Number(apertura.value) / 100;
  const dimensione = 310 * (1 - forma + forma * (0.18 + 0.82 * Math.pow(Math.abs(2 * t - 1), 0.9)));
  const giro = t * 3 * Math.PI + rotazione;
  return [[-1,-1], [1,-1], [1,1], [-1,1]].map(([sx, sz]) => {
    const x = sx * dimensione, z = sz * dimensione * 0.66;
    return { x: x * Math.cos(giro) - z * Math.sin(giro), y: 450 - t * 900,
      z: x * Math.sin(giro) + z * Math.cos(giro) };
  });
}

function disegna() {
  if (interno) { disegnaInterno(); return; }
  const larghezza = svg.clientWidth;
  const altezza = svg.clientHeight;
  const mobile = larghezza <= 650;
  const angolo = inclinazione * Math.PI / 180;
  const forma = Number(apertura.value) / 100;
  const livelli = [];

  // Proiezione di quattro vertici per ogni cornice, senza superfici piene.
  for (let i = 0; i < numeroCornici; i++) {
    const punti = vertici(i).map(({x, y, z}) => ({
      x, y: y * Math.cos(angolo) - z * Math.sin(angolo),
      z: y * Math.sin(angolo) + z * Math.cos(angolo)
    }));
    livelli.push({ i, punti, profondita: punti.reduce((s,p) => s + p.z, 0) / 4 });
  }

  // Inquadra tutti i vertici nello spazio libero: nessuna cornice tagliata.
  const tutti = livelli.flatMap(l => l.punti);
  const minX = Math.min(...tutti.map(p => p.x));
  const maxX = Math.max(...tutti.map(p => p.x));
  const minY = Math.min(...tutti.map(p => p.y));
  const maxY = Math.max(...tutti.map(p => p.y));
  const spazioW = larghezza * (mobile ? 0.68 : 0.54);
  const alto = mobile ? 95 : 85;
  const basso = mobile ? 205 : 155;
  const spazioH = Math.max(30, altezza - alto - basso);
  const scala = Math.min(spazioW / (maxX - minX), spazioH / Math.max(1, maxY - minY));
  const centroX = larghezza / 2;
  const centroY = alto + spazioH / 2;

  livelli.sort((a,b) => a.profondita - b.profondita);
  for (const livello of livelli) {
    const { i, punti } = livello;
    const cornice = cornici[i];
    const proiettati = punti.map(p => ({
      x: centroX + (p.x - (minX + maxX) / 2) * scala,
      y: centroY + (p.y - (minY + maxY) / 2) * scala
    }));
    const scelta = i === selezionata;
    cornice.poligono.setAttribute('points', proiettati.map(p => `${p.x},${p.y}`).join(' '));
    cornice.poligono.classList.toggle('selezionata', scelta);
    cornice.poligono.setAttribute('aria-pressed', String(scelta));
    cornice.poligono.style.opacity = 1;
    cornice.numero.setAttribute('x', proiettati[0].x + 5);
    cornice.numero.setAttribute('y', proiettati[0].y - 5);
    cornice.numero.classList.toggle('selezionato', scelta);
    cornice.numero.style.display = scelta || i % 6 === 0 ? '' : 'none';
    gruppo.append(cornice.gruppo);
  }
}

function cambiaVista(nome) {
  if (interno) impostaInterno(false);
  vista = nome;
  inclinazione = viste[nome];
  document.querySelectorAll('[data-vista]').forEach(p => {
    p.setAttribute('aria-pressed', String(p.dataset.vista === nome));
  });
  disegna();
}
document.querySelectorAll('[data-vista]').forEach(p => {
  p.addEventListener('click', () => cambiaVista(p.dataset.vista));
});
apertura.addEventListener('input', () => { valore.value = `${apertura.value}%`; disegna(); });

svg.addEventListener('pointerdown', evento => {
  if (!evento.isPrimary || evento.button !== 0) return;
  mosso = false;
  trascinamento = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, rotazione, yaw: camera.yaw, pitch: camera.pitch };
});
window.addEventListener('pointermove', evento => {
  if (!trascinamento || trascinamento.id !== evento.pointerId) return;
  const dx = evento.clientX - trascinamento.x;
  const dy = evento.clientY - trascinamento.y;
  if (Math.abs(dx) + Math.abs(dy) > 5) mosso = true;
  if (!mosso) return;
  svg.classList.add('trascinamento');
  if (interno) {
    camera.yaw = trascinamento.yaw + dx * 0.006;
    camera.pitch = Math.max(-1.45, Math.min(1.45, trascinamento.pitch - dy * 0.006));
  } else rotazione = trascinamento.rotazione + dx * 0.006;
  disegna();
});
function fineTrascinamento() { trascinamento = null; svg.classList.remove('trascinamento'); }
window.addEventListener('pointerup', fineTrascinamento);
window.addEventListener('pointercancel', fineTrascinamento);
window.addEventListener('blur', fineTrascinamento);
svg.addEventListener('keydown', evento => {
  if (interno || !['ArrowLeft', 'ArrowRight'].includes(evento.key)) return;
  evento.preventDefault();
  rotazione += evento.key === 'ArrowLeft' ? -0.1 : 0.1;
  disegna();
});
function aggiornaPausa() {
  pausa.textContent = animazione ? 'Ⅱ' : '▷';
  pausa.setAttribute('aria-label', animazione ? 'Stop rotation' : 'Start rotation');
  pausa.setAttribute('aria-pressed', String(animazione));
}
function fotogramma(tempo) {
  if (!animazione) return;
  if (ultimoTempo && !trascinamento && !document.hidden) {
    rotazione += Math.min(tempo - ultimoTempo, 50) * 0.00007;
    disegna();
  }
  ultimoTempo = tempo;
  requestAnimationFrame(fotogramma);
}
pausa.addEventListener('click', () => {
  animazione = !animazione;
  aggiornaPausa();
  if (animazione) { ultimoTempo = 0; requestAnimationFrame(fotogramma); }
});


// Camera prospettica con ritaglio degli spigoli sul piano vicino.
function disegnaInterno() {
  const w = svg.clientWidth, h = svg.clientHeight;
  const focale = Math.min(w, h) * 0.8;
  const livello = Math.max(0, Math.min(35, Math.round((450 - camera.y) / 900 * 35)));
  const vistaCamera = p => {
    const dx = p.x - camera.x, dy = p.y - camera.y, dz = p.z - camera.z;
    const x = dx * Math.cos(camera.yaw) - dz * Math.sin(camera.yaw);
    const avanti = dx * Math.sin(camera.yaw) + dz * Math.cos(camera.yaw);
    return { x, y: dy * Math.cos(camera.pitch) + avanti * Math.sin(camera.pitch),
      z: avanti * Math.cos(camera.pitch) - dy * Math.sin(camera.pitch) };
  };
  const proietta = p => `${w / 2 + p.x / p.z * focale},${h / 2 + p.y / p.z * focale}`;
  cornici.forEach((cornice, i) => {
    if (!cornice.interno) {
      cornice.interno = elemento('path', { fill: 'none', 'vector-effect': 'non-scaling-stroke' });
      cornice.gruppo.append(cornice.interno);
    }
    cornice.poligono.style.display = 'none';
    cornice.numero.style.display = 'none';
    cornice.interno.style.display = '';
    const punti = vertici(i).map(vistaCamera);
    let d = '';
    for (let j = 0; j < 4; j++) {
      let a = punti[j], b = punti[(j + 1) % 4];
      if (a.z < 3 && b.z < 3) continue;
      if (a.z < 3 || b.z < 3) {
        const t = (3 - a.z) / (b.z - a.z);
        const taglio = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: 3 };
        if (a.z < 3) a = taglio; else b = taglio;
      }
      d += `M${proietta(a)}L${proietta(b)}`;
    }
    cornice.interno.setAttribute('d', d);
    cornice.interno.setAttribute('stroke', i === selezionata ? '#FF00FF' : '#FFFFFF');
    cornice.interno.setAttribute('stroke-width', i === selezionata ? '1.8' : '.85');
  });
  quota.value = livello;
  document.querySelector('#livello-attuale').value = `${String(livello + 1).padStart(2, '0')} / 36`;
  mappa.replaceChildren();
  const scala = 0.16;
  for (const i of [0, 9, 18, 26, 35, livello]) {
    mappa.append(elemento('polygon', {
      points: vertici(i).map(p => `${90 + p.x * scala},${75 - p.z * scala}`).join(' '),
      fill: 'none', stroke: '#FFFFFF', 'stroke-width': i === livello ? 1.2 : 0.5,
      opacity: i === livello ? 1 : 0.35
    }));
  }
  const x = 90 + camera.x * scala, y = 75 - camera.z * scala;
  const dx = Math.sin(camera.yaw), dy = -Math.cos(camera.yaw);
  mappa.append(elemento('path', { d: `M${x},${y}l${dx * 23 + dy * 12},${dy * 23 - dx * 12}l${-dy * 24},${dx * 24}Z`, fill: '#FF00FF', 'fill-opacity': '.22', stroke: '#FF00FF', 'stroke-width': '.7' }));
  mappa.append(elemento('circle', { cx: x, cy: y, r: 3, fill: '#FF00FF' }));
}

function impostaInterno(attivo) {
  interno = attivo;
  tasti.clear(); fineTrascinamento();
  document.body.classList.toggle('interno', interno);
  document.querySelector('#minimappa').hidden = !interno;
  document.querySelector('#movimento').hidden = !interno;
  entra.textContent = interno ? 'Exit the vortex ↗' : 'Enter the vortex ↗';
  entra.setAttribute('aria-pressed', String(interno));
  document.querySelector('.istruzioni').textContent = interno
    ? 'WASD / arrows: move · Q/E: height · Drag: look · Esc: exit'
    : '● Drag to explore';
  svg.setAttribute('aria-label', interno ? 'Inside the vortex. Use WASD or the arrow keys to move, Q and E to change height. Drag to look around.' : 'Vortex of 36 frames. Drag to rotate.');
  if (interno) {
    animazione = false; aggiornaPausa();
    camera.x = 0; camera.z = 0; camera.y = 450 - selezionata / 35 * 900 - 10;
    camera.pitch = -0.65; camera.yaw = rotazione;
    svg.focus({ preventScroll: true });
    requestAnimationFrame(cammina);
  } else {
    cornici.forEach(c => { c.poligono.style.display = ''; if (c.interno) c.interno.style.display = 'none'; });
    entra.focus({ preventScroll: true });
  }
  disegna();
}

function muovi(avanti, lato, verticale, tempo) {
  camera.x += (Math.sin(camera.yaw) * avanti + Math.cos(camera.yaw) * lato) * tempo;
  camera.z += (Math.cos(camera.yaw) * avanti - Math.sin(camera.yaw) * lato) * tempo;
  camera.y = Math.max(-440, Math.min(440, camera.y - verticale * tempo));
  // Mantieni il visitatore entro la cornice del livello che sta attraversando.
  const t = (450 - camera.y) / 900;
  const forma = Number(apertura.value) / 100;
  const dimensione = 310 * (1 - forma + forma * (0.18 + 0.82 * Math.pow(Math.abs(2*t-1), .9)));
  const giro = t * 3 * Math.PI + rotazione;
  let x = camera.x * Math.cos(giro) + camera.z * Math.sin(giro);
  let z = -camera.x * Math.sin(giro) + camera.z * Math.cos(giro);
  x = Math.max(-dimensione * .85, Math.min(dimensione * .85, x));
  z = Math.max(-dimensione * .66 * .85, Math.min(dimensione * .66 * .85, z));
  camera.x = x * Math.cos(giro) - z * Math.sin(giro);
  camera.z = x * Math.sin(giro) + z * Math.cos(giro);
}
let tempoCammino = 0;
function cammina(tempo) {
  if (!interno) { tempoCammino = 0; return; }
  const dt = tempoCammino ? Math.min(tempo - tempoCammino, 40) * .12 : 0;
  tempoCammino = tempo;
  if (tasti.size && !document.querySelector('dialog[open]')) {
    muovi(Number(tasti.has('w') || tasti.has('arrowup')) - Number(tasti.has('s') || tasti.has('arrowdown')),
      Number(tasti.has('d') || tasti.has('arrowright')) - Number(tasti.has('a') || tasti.has('arrowleft')),
      Number(tasti.has('e')) - Number(tasti.has('q')), dt);
    disegna();
  }
  requestAnimationFrame(cammina);
}
entra.addEventListener('click', () => impostaInterno(!interno));
quota.addEventListener('input', () => { camera.y = 450 - Number(quota.value) / 35 * 900; muovi(0, 0, 0, 0); disegna(); });
window.addEventListener('keydown', e => {
  if (!interno || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') { impostaInterno(false); return; }
  if (e.target.matches('input, button')) return;
  const key = e.key.toLowerCase();
  if (['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) { e.preventDefault(); tasti.add(key); }
});
window.addEventListener('keyup', e => tasti.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => tasti.clear());
document.addEventListener('visibilitychange', () => tasti.clear());
document.querySelectorAll('[data-passo]').forEach(b => {
  const key = { avanti: 'w', indietro: 's', sinistra: 'a', destra: 'd' }[b.dataset.passo];
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); tasti.add(key); });
  b.addEventListener('pointerup', () => tasti.delete(key));
  b.addEventListener('pointercancel', () => tasti.delete(key));
  b.addEventListener('lostpointercapture', () => tasti.delete(key));
  b.addEventListener('click', e => { if (e.detail === 0) { muovi(key === 'w' ? 1 : key === 's' ? -1 : 0, key === 'd' ? 1 : key === 'a' ? -1 : 0, 0, 12); disegna(); } });
});
window.addEventListener('resize', disegna);
disegna();
