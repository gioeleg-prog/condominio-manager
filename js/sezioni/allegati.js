// Allegati: caricamento su Storage, visualizzatore, graffette, eliminazione.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

// Graffetta accanto al titolo della spesa: la colonna "Allegati" è l'ultima
// della tabella e su finestre strette (o con zoom) finisce fuori schermo.
// Una graffetta per allegato (massimo 3, il resto resta nella colonna), con lo
// stesso data-view-allegato dei pulsanti della colonna: stesso visualizzatore.
function renderAllegatiClip(spesa) {
  const allegati = spesa.allegati || [];
  if (allegati.length === 0) return '';
  const extra = allegati.length > 3 ? `<span class="attach-clip-more">+${allegati.length - 3}</span>` : '';
  return ' ' + allegati.slice(0, 3).map(a => {
    const safe = JSON.stringify({id:a.id}).replace(/'/g,'&#39;');
    return `<button class="attach-clip" data-view-allegato='${safe}' title="Apri allegato: ${esc(a.nome)}" aria-label="Apri allegato ${esc(a.nome)}">📎</button>`;
  }).join('') + extra;
}

function renderAllegatiChip(spesa) {
  const allegati = spesa.allegati || [];
  if (allegati.length === 0) return '<span style="color:var(--text2);font-size:12px">—</span>';
  return `<div style="display:flex;flex-wrap:wrap;gap:4px">
    ${allegati.map(a => {
      const safe = JSON.stringify({id:a.id}).replace(/'/g,'&#39;');
      return `<button class="attach-chip" data-view-allegato='${safe}' title="${esc(a.nome)}">${fileEmoji(a.mime)} <span>${esc(a.nome.length>14?a.nome.slice(0,12)+'…':a.nome)}</span></button>`;
    }).join('')}
  </div>`;
}

// ===========================
// FILE VIEWER
// ===========================
// Recupera i byte di un allegato SEC-04 (storagePath) con l'SDK autenticato —
// ogni chiamata passa dalle storage.rules — e li espone come blob URL locale,
// mai persistito né condiviso. v.data64 (allegati legacy pre-SEC-04) è già
// utilizzabile direttamente.
async function fetchAllegatoBlobUrl(v) {
  const { storage, ref, getBytes } = window._fb;
  const bytes = await getBytes(ref(storage, v.storagePath));
  const blob = new Blob([bytes], { type: v.mime || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

function renderViewer() {
  const v = state.viewer;
  if (v.loading) {
    return `<div class="viewer-overlay" id="viewer-overlay">
      <div class="viewer-content"><div style="color:white">Caricamento allegato…</div></div>
    </div>`;
  }
  const isImg = v.mime.startsWith('image/');
  const isPdf = v.mime === 'application/pdf';
  const src = v.blobUrl || v.data64;
  return `
  <div class="viewer-overlay" id="viewer-overlay">
    <div class="viewer-bar">
      <div class="title">📎 ${esc(v.nome)}</div>
      <div class="actions">
        <button class="viewer-btn" id="viewer-download">⬇ Scarica</button>
        <button class="viewer-btn" id="viewer-close">✕ Chiudi</button>
      </div>
    </div>
    <div class="viewer-content">
      ${isImg ? `<img src="${esc(src)}" alt="${esc(v.nome)}">` :
        isPdf ? `<iframe src="${esc(src)}" title="${esc(v.nome)}"></iframe>` :
        `<div style="background:white;padding:2rem;border-radius:8px;text-align:center;color:#333">
          <div style="font-size:48px;margin-bottom:1rem">${fileEmoji(v.mime)}</div>
          <div style="font-weight:600;margin-bottom:.5rem">${esc(v.nome)}</div>
          <div style="font-size:13px;color:#666;margin-bottom:1.5rem">Anteprima non disponibile per questo tipo di file.</div>
          <button class="viewer-btn" id="viewer-download2" style="background:var(--accent);border:none;padding:10px 24px;border-radius:6px;cursor:pointer;color:white;font-size:14px">⬇ Scarica file</button>
        </div>`}
    </div>
  </div>`;
}

function closeViewer() {
  if (state.viewer?.blobUrl) URL.revokeObjectURL(state.viewer.blobUrl);
  setState({viewer:null});
}

function bindViewer() {
  const vc = document.getElementById('viewer-close');
  if (vc) vc.onclick = closeViewer;
  const vov = document.getElementById('viewer-overlay');
  if (vov) vov.onclick = e => { if(e.target===vov) closeViewer(); };
  const vd = document.getElementById('viewer-download');
  if (vd) vd.onclick = () => downloadAllegato(state.viewer);
  const vd2 = document.getElementById('viewer-download2');
  if (vd2) vd2.onclick = () => downloadAllegato(state.viewer);
}

async function downloadAllegato(v) {
  let href = v.blobUrl || v.data64;
  let isTemp = false;
  if (!href && v.storagePath) {
    try { href = await fetchAllegatoBlobUrl(v); isTemp = true; }
    catch (err) { alert('Impossibile scaricare l\'allegato: ' + (err.message || err)); return; }
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = v.nome;
  a.click();
  if (isTemp) setTimeout(() => URL.revokeObjectURL(href), 30000);
}

function fileEmoji(mime) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('excel') || mime.includes('sheet')) return '📊';
  if (mime.includes('zip') || mime.includes('rar')) return '🗜️';
  return '📎';
}

function fileIconClass(mime) {
  if (mime.startsWith('image/')) return 'img';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word') || mime.includes('document')) return 'doc';
  if (mime.includes('excel') || mime.includes('sheet')) return 'xls';
  return 'other';
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// SEC-04: gli allegati vanno su Firebase Storage (buildings/{edificioId}/allegati/...)
// invece di essere incorporati come Base64 nel blob Firestore appdata/cm_spese —
// quel blob è un unico documento condiviso da tutti gli edifici (limite 1MB) e ogni
// save() lo riscriveva per intero, allegati compresi.
async function handleFilesDrop(files) {
  const MAX = 5 * 1024 * 1024; // 5MB per file (rispecchia il limite di storage.rules)
  const added = [];
  for (const file of Array.from(files)) {
    if (file.size > MAX) { alert(`Il file "${file.name}" supera il limite di 5MB.`); continue; }
    const id = newId();
    try {
      const { storage, ref, uploadBytes } = window._fb;
      const storagePath = `buildings/${state.edificioAttivo}/allegati/${id}_${file.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      // Non salviamo un URL pubblico: getDownloadURL() incorpora un token che
      // funziona per chiunque lo possieda, bypassando le storage.rules. I byte si
      // recuperano on-demand con l'SDK autenticato (getBytes), che le rispetta.
      added.push({ id, nome: file.name, mime: file.type||'application/octet-stream', size: file.size, storagePath });
    } catch (err) {
      // Le storage.rules rifiutano i tipi non ammessi (es. SVG) e i file oltre 5 MB
      // con lo stesso codice dei permessi: messaggio comprensibile al posto di
      // quello tecnico in inglese.
      const motivo = err.code === 'storage/unauthorized'
        ? 'tipo di file non ammesso (si accettano PDF, immagini, documenti Office/OpenDocument, testo e CSV) oppure permessi insufficienti.'
        : (err.message || err);
      alert(`Impossibile allegare "${file.name}": ` + motivo);
    }
  }
  state.pendingFiles = [...state.pendingFiles, ...added];
  renderPendingFiles();
}

function renderPendingFiles() {
  const container = document.getElementById('allegati-pending');
  if (!container) return;
  const files = state.pendingFiles;
  if (files.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="allegati-list">${files.map(f => renderAllegatoItem(f, true)).join('')}</div>`;
  container.querySelectorAll('[data-remove-pending]').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.removePending);
      const f = state.pendingFiles.find(x => x.id === id);
      if (f?.storagePath) {
        try {
          const { storage, ref, deleteObject } = window._fb;
          await deleteObject(ref(storage, f.storagePath));
        } catch (err) { console.warn('deleteObject (pending):', err.message); }
      }
      state.pendingFiles = state.pendingFiles.filter(f => f.id !== id);
      renderPendingFiles();
    };
  });
}

function renderAllegatoItem(f, isPending=false) {
  const cls = fileIconClass(f.mime);
  return `<div class="allegato-item">
    <div class="allegato-icon ${cls}">${fileEmoji(f.mime)}</div>
    <div class="allegato-info">
      <div class="nome">${esc(f.nome)}</div>
      <div class="meta">${fmtSize(f.size)} · ${f.mime.split('/')[1]?.toUpperCase()||'FILE'}</div>
    </div>
    <div class="allegato-actions">
      ${isPending
        ? `<button class="allegato-btn danger" data-remove-pending="${f.id}" title="Rimuovi">🗑</button>`
        : `<button class="allegato-btn" data-view-allegato='${JSON.stringify({id:f.id})}' title="Visualizza">👁</button>
           <button class="allegato-btn" data-dl-allegato='${JSON.stringify({id:f.id})}' title="Scarica">⬇</button>
           <button class="allegato-btn danger" data-del-allegato='${JSON.stringify({id:f.id})}' title="Elimina">🗑</button>`}
    </div>
  </div>`;
}

// Generica per qualunque entità con campo "allegati" (array). Prende UNA
// lista di sorgenti {records, stateKey, appdataKey} e si lega UNA sola
// volta ai selettori — chiamarla più volte (una per entità) romperebbe le
// cose, perché i tre selettori data-view/dl/del-allegato non sono scoped
// per entità: una seconda chiamata con onclick= (non addEventListener)
// sovrascriverebbe silenziosamente i binding della prima anche sui bottoni
// di un'altra entità già presenti nella stessa pagina/modal.
function bindAllegatiInTable(sources) {
  const findIn = (id) => {
    for (const src of sources) {
      for (const r of src.records) {
        if (r.allegati) {
          const found = r.allegati.find(a=>a.id===id);
          if (found) return { found, src };
        }
      }
    }
    return { found: null, src: null };
  };

  document.querySelectorAll('[data-view-allegato]').forEach(btn => {
    btn.onclick = async () => {
      const {id} = JSON.parse(btn.dataset.viewAllegato);
      const { found } = findIn(id);
      if (!found) return;
      if (found.storagePath) {
        setState({viewer:{nome:found.nome,mime:found.mime,size:found.size,loading:true}});
        try {
          const blobUrl = await fetchAllegatoBlobUrl(found);
          setState({viewer:{nome:found.nome,mime:found.mime,size:found.size,blobUrl}});
        } catch (err) {
          setState({viewer:null});
          alert('Impossibile aprire l\'allegato: ' + (err.message || err));
        }
      } else {
        setState({viewer:{nome:found.nome,mime:found.mime,data64:found.data64,size:found.size}});
      }
    };
  });
  document.querySelectorAll('[data-dl-allegato]').forEach(btn => {
    btn.onclick = () => {
      const {id} = JSON.parse(btn.dataset.dlAllegato);
      const { found } = findIn(id);
      if (found) downloadAllegato(found);
    };
  });
  document.querySelectorAll('[data-del-allegato]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Eliminare questo allegato?')) return;
      const {id} = JSON.parse(btn.dataset.delAllegato);
      const { found: toDelete, src } = findIn(id);
      if (!toDelete || !src) return;
      if (toDelete.storagePath) {
        try {
          const { storage, ref, deleteObject } = window._fb;
          await deleteObject(ref(storage, toDelete.storagePath));
        } catch (err) {
          // File già assente: si toglie comunque il riferimento. Qualunque altro
          // errore (permessi, rete): ci si ferma, altrimenti il record perderebbe
          // il collegamento a un file che invece esiste ancora.
          if (err.code !== 'storage/object-not-found') {
            alert('Impossibile eliminare l’allegato: ' + (err.code === 'storage/unauthorized'
              ? 'non hai i permessi per eliminarlo.' : (err.message || err)));
            return;
          }
        }
      }
      const nuoviRecords = state[src.stateKey].map(r => ({
        ...r,
        allegati: (r.allegati||[]).filter(a=>a.id!==id)
      }));
      save(src.appdataKey, nuoviRecords);
      // Se l'allegato è stato eliminato dalla scheda di modifica aperta, anche la
      // copia del record usata dalla scheda va aggiornata: prima restava, l'allegato
      // sembrava non eliminato e un successivo "Salva" lo rimetteva (con il file
      // ormai cancellato da Storage).
      const md = state.modal?.data;
      if (md && Array.isArray(md.allegati) && md.allegati.some(a => a.id === id)) {
        // Scheda aperta: si aggiorna lo stato senza ridisegnarla (le modifiche
        // non ancora salvate nei campi restano) e si toglie solo la riga.
        state[src.stateKey] = nuoviRecords;
        state.modal = { ...state.modal, data: { ...md, allegati: md.allegati.filter(a => a.id !== id) } };
        // Tutte le righe di questo allegato (es. nei verbali compare sia nella
        // scheda sia nella lista dietro).
        document.querySelectorAll('[data-del-allegato]').forEach(b => {
          try { if (JSON.parse(b.dataset.delAllegato).id === id) b.closest('.allegato-item')?.remove(); } catch (e) { /* ignora */ }
        });
        btn.closest('.allegato-item')?.remove();
        return;
      }
      setState({[src.stateKey]: nuoviRecords});
    };
  });
}

function bindDropzone() {
  const dz = document.getElementById('dropzone');
  const fi = document.getElementById('file-input');
  if (!dz || !fi) return;
  dz.onclick = () => fi.click();
  fi.onchange = e => handleFilesDrop(e.target.files).then(()=>{ fi.value=''; });
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = () => dz.classList.remove('drag-over');
  dz.ondrop = e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    handleFilesDrop(e.dataTransfer.files);
  };
  // render any already-pending files (edit mode)
  renderPendingFiles();
}
