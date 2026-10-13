/**
 * Stitch Image Extractor PRO - Core Application Logic
 * Client-side unnesting, flattening, preview gallery, and selective download.
 */

// State
const state = {
  images: [],         // Array of image objects
  activeFilter: 'all',// 'all', 'png', 'jpg', 'webp', 'svg'
  searchQuery: '',    // Text search query
  currentZipName: 'Stitch_Images'
};

const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.bmp', '.avif'];

// DOM Elements
const dropzoneCard = document.getElementById('dropzoneCard');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const progressCard = document.getElementById('progressCard');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const workspaceSection = document.getElementById('workspaceSection');
const imageGrid = document.getElementById('imageGrid');

// Stats Elements
const statTotalCount = document.getElementById('statTotalCount');
const statSelectedCount = document.getElementById('statSelectedCount');
const statTotalSize = document.getElementById('statTotalSize');

// Action Buttons
const btnSelectAll = document.getElementById('btnSelectAll');
const btnDeselectAll = document.getElementById('btnDeselectAll');
const btnDownloadCleanZip = document.getElementById('btnDownloadCleanZip');
const btnDownloadLoose = document.getElementById('btnDownloadLoose');

// Filter & Search
const searchInput = document.getElementById('searchInput');
const filterPillsContainer = document.getElementById('filterPillsContainer');

// Lightbox Elements
const lightboxModal = document.getElementById('lightboxModal');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxFileName = document.getElementById('lightboxFileName');
const lightboxDimBadge = document.getElementById('lightboxDimBadge');
const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

let currentActiveLightboxImage = null;

// ==========================================
// Initialization & Event Listeners
// ==========================================
function init() {
  setupDragAndDrop();
  setupEventListeners();
}

function setupDragAndDrop() {
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzoneCard.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleZipFile(e.target.files[0]);
    }
  });

  // Drag over animations
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzoneCard.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneCard.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzoneCard.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneCard.classList.remove('drag-active');
    }, false);
  });

  dropzoneCard.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      const file = dt.files[0];
      if (file.name.toLowerCase().endsWith('.zip')) {
        handleZipFile(file);
      } else {
        alert('Por favor sube un archivo con extensión .ZIP de Google Stitch.');
      }
    }
  });

  // Window drag prevent
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

function setupEventListeners() {
  // Selection
  btnSelectAll.addEventListener('click', () => setAllSelection(true));
  btnDeselectAll.addEventListener('click', () => setAllSelection(false));

  // Export buttons
  btnDownloadCleanZip.addEventListener('click', exportCleanZip);
  btnDownloadLoose.addEventListener('click', exportLooseFiles);

  // Search and Filter
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderGallery();
  });

  filterPillsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    renderGallery();
  });

  // Lightbox
  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal.style.display === 'flex') {
      closeLightbox();
    }
  });

  lightboxDownloadBtn.addEventListener('click', () => {
    if (currentActiveLightboxImage) {
      downloadSingleImage(currentActiveLightboxImage);
    }
  });
}

// ==========================================
// ZIP Processing & Image Extraction
// ==========================================
async function handleZipFile(file) {
  // Save zip base name
  state.currentZipName = file.name.replace(/\.[^/.]+$/, "");

  // Reset state
  state.images.forEach(img => {
    if (img.blobUrl) URL.revokeObjectURL(img.blobUrl);
  });
  state.images = [];

  // Show progress UI
  progressCard.style.display = 'block';
  updateProgress(5, 'Leyendo estructura del archivo ZIP de Stitch...');

  try {
    const jszip = new JSZip();
    const zipContent = await jszip.loadAsync(file);

    // Filter image entries (ignoring folders and macOS metadata)
    const imageEntries = [];
    zipContent.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      if (relativePath.includes('__MACOSX') || relativePath.includes('.DS_Store')) return;

      const lowerName = zipEntry.name.toLowerCase();
      const hasImageExt = VALID_EXTENSIONS.some(ext => lowerName.endsWith(ext));
      if (hasImageExt) {
        imageEntries.push(zipEntry);
      }
    });

    if (imageEntries.length === 0) {
      progressCard.style.display = 'none';
      alert('No se encontraron imágenes en el archivo ZIP seleccionado.');
      return;
    }

    updateProgress(20, `Se encontraron ${imageEntries.length} imágenes. Desanidando carpetas...`);

    const nameTracker = new Map();
    const extractedList = [];

    // Process entries sequentially with progress updates
    for (let i = 0; i < imageEntries.length; i++) {
      const entry = imageEntries[i];
      const percent = 20 + Math.floor(((i + 1) / imageEntries.length) * 75);
      updateProgress(percent, `Procesando imagen ${i + 1} de ${imageEntries.length}...`);

      const rawFullName = entry.name;
      const rawBaseName = rawFullName.split('/').pop().split('\\').pop();

      // Anti-collision renaming
      const cleanName = getAntiCollisionName(rawBaseName, nameTracker);

      // Extract blob
      const blob = await entry.async('blob');
      const blobUrl = URL.createObjectURL(blob);
      const ext = cleanName.substring(cleanName.lastIndexOf('.')).toLowerCase();

      const imageItem = {
        id: 'img_' + Math.random().toString(36).substr(2, 9),
        filename: cleanName,
        originalPath: rawFullName,
        extension: ext.replace('.', ''),
        blob: blob,
        blobUrl: blobUrl,
        size: blob.size,
        selected: true,
        width: 0,
        height: 0
      };

      // Load dimensions asynchronously
      getImageDimensions(blobUrl).then(dims => {
        imageItem.width = dims.width;
        imageItem.height = dims.height;
        const dimEl = document.getElementById(`dim_${imageItem.id}`);
        if (dimEl) dimEl.textContent = `${dims.width} × ${dims.height}`;
      });

      extractedList.push(imageItem);
    }

    state.images = extractedList;
    updateProgress(100, '¡Extracción completada con éxito!');

    setTimeout(() => {
      progressCard.style.display = 'none';
      workspaceSection.style.display = 'block';
      workspaceSection.scrollIntoView({ behavior: 'smooth' });
      renderGallery();
      updateStats();
    }, 400);

  } catch (err) {
    console.error('Error al procesar el archivo ZIP:', err);
    progressCard.style.display = 'none';
    alert(`Ocurrió un error al leer el archivo ZIP: ${err.message}`);
  }
}

function getAntiCollisionName(originalName, tracker) {
  const dotIndex = originalName.lastIndexOf('.');
  const base = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
  const ext = dotIndex !== -1 ? originalName.substring(dotIndex) : '';

  if (!tracker.has(originalName.toLowerCase())) {
    tracker.set(originalName.toLowerCase(), 1);
    return originalName;
  } else {
    const count = tracker.get(originalName.toLowerCase());
    tracker.set(originalName.toLowerCase(), count + 1);
    return `${base}_${count}${ext}`;
  }
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

function updateProgress(percent, message) {
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  if (message) progressText.textContent = message;
}

// ==========================================
// Gallery Rendering & Interactions
// ==========================================
function renderGallery() {
  imageGrid.innerHTML = '';

  const filtered = state.images.filter(img => {
    // Filter by type
    if (state.activeFilter !== 'all') {
      const matchType = state.activeFilter === 'jpg' 
        ? (img.extension === 'jpg' || img.extension === 'jpeg') 
        : img.extension === state.activeFilter;
      if (!matchType) return false;
    }

    // Filter by search
    if (state.searchQuery) {
      if (!img.filename.toLowerCase().includes(state.searchQuery)) {
        return false;
      }
    }

    return true;
  });

  if (filtered.length === 0) {
    imageGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">No se encontraron imágenes con los filtros actuales.</p>
        <p style="font-size: 0.85rem;">Prueba limpiando el buscador o cambiando el filtro de formato.</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(img => {
    const card = document.createElement('div');
    card.className = `image-card ${img.selected ? 'selected' : ''}`;
    card.id = `card_${img.id}`;

    const formattedSize = formatFileSize(img.size);

    card.innerHTML = `
      <div class="image-preview-wrapper" data-id="${img.id}">
        <div class="overlay-checkbox-box" data-action="checkbox" data-id="${img.id}">
          <div class="custom-checkbox">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
        </div>

        <div class="zoom-hint-badge" title="Ampliar vista previa">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </div>

        <img src="${img.blobUrl}" alt="${img.filename}" loading="lazy">
      </div>

      <div class="image-card-info">
        <div class="image-title-row">
          <span class="image-filename" title="${img.filename}">${img.filename}</span>
          <span class="image-format-badge">${img.extension}</span>
        </div>

        <div class="image-meta-row">
          <span id="dim_${img.id}">${img.width ? `${img.width} × ${img.height}` : '...'}</span>
          <span>${formattedSize}</span>
        </div>

        <div class="original-path-tooltip" title="Ubicación original dentro de Stitch: ${img.originalPath}">
          📁 ${img.originalPath}
        </div>

        <div class="card-actions-row">
          <button class="btn-card-download" data-action="download" data-id="${img.id}" title="Descargar solo esta imagen">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>Descargar</span>
          </button>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  imageGrid.appendChild(fragment);

  // Card delegation events
  imageGrid.onclick = handleCardClick;
}

function handleCardClick(e) {
  const checkboxBox = e.target.closest('[data-action="checkbox"]');
  if (checkboxBox) {
    const id = checkboxBox.dataset.id;
    toggleSelectImage(id);
    return;
  }

  const downloadBtn = e.target.closest('[data-action="download"]');
  if (downloadBtn) {
    const id = downloadBtn.dataset.id;
    const imgObj = state.images.find(img => img.id === id);
    if (imgObj) downloadSingleImage(imgObj);
    return;
  }

  const previewWrapper = e.target.closest('.image-preview-wrapper');
  if (previewWrapper) {
    const id = previewWrapper.dataset.id;
    const imgObj = state.images.find(img => img.id === id);
    if (imgObj) openLightbox(imgObj);
  }
}

function toggleSelectImage(id) {
  const img = state.images.find(i => i.id === id);
  if (!img) return;

  img.selected = !img.selected;
  const card = document.getElementById(`card_${id}`);
  if (card) {
    card.classList.toggle('selected', img.selected);
  }
  updateStats();
}

function setAllSelection(value) {
  state.images.forEach(img => {
    img.selected = value;
  });
  document.querySelectorAll('.image-card').forEach(card => {
    card.classList.toggle('selected', value);
  });
  updateStats();
}

function updateStats() {
  const total = state.images.length;
  const selectedImages = state.images.filter(i => i.selected);
  const selectedCount = selectedImages.length;
  const selectedBytes = selectedImages.reduce((acc, curr) => acc + curr.size, 0);

  statTotalCount.textContent = total;
  statSelectedCount.textContent = selectedCount;
  statTotalSize.textContent = formatFileSize(selectedBytes);

  // Enable/disable export buttons based on selection
  const hasSelection = selectedCount > 0;
  btnDownloadCleanZip.disabled = !hasSelection;
  btnDownloadLoose.disabled = !hasSelection;
}

// ==========================================
// Export & Download Capabilities
// ==========================================

function downloadSingleImage(img) {
  if (window.saveAs) {
    saveAs(img.blob, img.filename);
  } else {
    const a = document.createElement('a');
    a.href = img.blobUrl;
    a.download = img.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Generates and downloads a clean, 100% flattened ZIP with NO subfolders
 */
async function exportCleanZip() {
  const selected = state.images.filter(i => i.selected);
  if (selected.length === 0) {
    alert('Por favor selecciona al menos una imagen para descargar.');
    return;
  }

  btnDownloadCleanZip.disabled = true;
  const originalText = btnDownloadCleanZip.innerHTML;
  btnDownloadCleanZip.innerHTML = `
    <div class="spinner" style="width: 14px; height: 14px;"></div>
    <span>Generando ZIP Limpio...</span>
  `;

  try {
    const cleanZip = new JSZip();

    // Append each selected image directly at root
    selected.forEach(img => {
      cleanZip.file(img.filename, img.blob);
    });

    const zipBlob = await cleanZip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const outputName = `${state.currentZipName}_Limpio.zip`;
    if (window.saveAs) {
      saveAs(zipBlob, outputName);
    } else {
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outputName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

  } catch (err) {
    console.error('Error generando zip:', err);
    alert('Error al generar el archivo ZIP: ' + err.message);
  } finally {
    btnDownloadCleanZip.disabled = false;
    btnDownloadCleanZip.innerHTML = originalText;
  }
}

/**
 * Downloads loose files directly into a user-selected folder using File System Access API,
 * or triggers individual browser downloads as fallback.
 */
async function exportLooseFiles() {
  const selected = state.images.filter(i => i.selected);
  if (selected.length === 0) {
    alert('Por favor selecciona al menos una imagen para descargar.');
    return;
  }

  // Check if Native Directory Picker is supported (Chrome, Edge, Opera)
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      btnDownloadLoose.disabled = true;
      const originalText = btnDownloadLoose.innerHTML;
      btnDownloadLoose.innerHTML = `
        <div class="spinner" style="width: 14px; height: 14px;"></div>
        <span>Guardando en carpeta...</span>
      `;

      let savedCount = 0;
      for (const img of selected) {
        const fileHandle = await dirHandle.getFileHandle(img.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(img.blob);
        await writable.close();
        savedCount++;
      }

      alert(`¡Éxito! Se guardaron ${savedCount} imágenes sueltas directamente en la carpeta elegida.`);
      btnDownloadLoose.disabled = false;
      btnDownloadLoose.innerHTML = originalText;
      return;

    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled folder picker dialog
        return;
      }
      console.warn('File System Access API falló, usando método de descarga secuencial:', err);
    }
  }

  // Fallback: Sequential browser download
  const confirmDownload = confirm(
    `Se van a descargar ${selected.length} imágenes individuales directamente a tu carpeta de Descargas.\n\n¿Deseas continuar?`
  );

  if (!confirmDownload) return;

  for (let i = 0; i < selected.length; i++) {
    const img = selected[i];
    downloadSingleImage(img);
    // Slight delay to prevent browser download throttling
    await new Promise(r => setTimeout(r, 220));
  }
}

// ==========================================
// Lightbox Modal
// ==========================================
function openLightbox(img) {
  currentActiveLightboxImage = img;
  lightboxImg.src = img.blobUrl;
  lightboxFileName.textContent = img.filename;
  lightboxDimBadge.textContent = img.width ? `${img.width} × ${img.height}` : formatFileSize(img.size);
  lightboxModal.style.display = 'flex';
}

function closeLightbox() {
  lightboxModal.style.display = 'none';
  currentActiveLightboxImage = null;
  lightboxImg.src = '';
}

// ==========================================
// Utility Helpers
// ==========================================
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
