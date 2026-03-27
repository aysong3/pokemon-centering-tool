(function () {
    'use strict';

    // ── State ──
    let imgNatW = 0, imgNatH = 0;
    let zoom = 1, panX = 0, panY = 0;
    let rotation = 0; // degrees * 10 internally → display / 10
    let selectedLineIdx = -1; // 0-7
    let draggingLine = -1;
    let dragStartMouse = 0;
    let dragStartPos = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let panStartPanX = 0, panStartPanY = 0;
    let imageLoaded = false;
    let edgeActive = false;
    let edgeDirty = true; // needs recompute
    let edgeColor = [0, 255, 136]; // green
    let currentImageSrc = null;

    // Lines: positions in image-pixel coordinates
    // 0: outer-left (V), 1: inner-left (V), 2: inner-right (V), 3: outer-right (V)
    // 4: outer-top (H), 5: inner-top (H), 6: inner-bottom (H), 7: outer-bottom (H)
    const lines = new Float64Array(8);
    const lineOrient = ['v','v','v','v','h','h','h','h'];
    const lineType   = ['outer','inner','inner','outer','outer','inner','inner','outer'];
    const lineNames  = [
        'Outer Left','Inner Left','Inner Right','Outer Right',
        'Outer Top','Inner Top','Inner Bottom','Outer Bottom'
    ];

    // ── DOM ──
    const workspace   = document.getElementById('workspace');
    const viewport    = document.getElementById('viewport');
    const emptyState  = document.getElementById('empty-state');
    const imgContainer= document.getElementById('image-container');
    const cardImage   = document.getElementById('card-image');
    const fileInput   = document.getElementById('file-input');
    const filePickBtn = document.getElementById('file-pick-btn');
    const zoomLabel   = document.getElementById('zoom-label');
    const zoomInBtn   = document.getElementById('zoom-in');
    const zoomOutBtn  = document.getElementById('zoom-out');
    const zoomFitBtn  = document.getElementById('zoom-fit');
    const rotSlider   = document.getElementById('rotation-slider');
    const rotValue    = document.getElementById('rotation-value');
    const rotReset    = document.getElementById('rotation-reset');
    const coordReadout= document.getElementById('coord-readout');
    const lrRatio     = document.getElementById('lr-ratio');
    const tbRatio     = document.getElementById('tb-ratio');
    const lrGauge     = document.getElementById('lr-gauge');
    const tbGauge     = document.getElementById('tb-gauge');
    const lrLeftPx    = document.getElementById('lr-left-px');
    const lrRightPx   = document.getElementById('lr-right-px');
    const tbTopPx     = document.getElementById('tb-top-px');
    const tbBottomPx  = document.getElementById('tb-bottom-px');
    const resetImageBtn = document.getElementById('reset-image');
    const filterContrast   = document.getElementById('filter-contrast');
    const filterBrightness = document.getElementById('filter-brightness');
    const filterSaturation = document.getElementById('filter-saturation');
    const filterContrastVal   = document.getElementById('filter-contrast-val');
    const filterBrightnessVal = document.getElementById('filter-brightness-val');
    const filterSaturationVal = document.getElementById('filter-saturation-val');
    const filterResetBtn = document.getElementById('filter-reset');
    const edgeOverlay    = document.getElementById('edge-overlay');
    const edgeToggleBtn  = document.getElementById('edge-toggle');
    const edgeMode       = document.getElementById('edge-mode');
    const edgeThreshold  = document.getElementById('edge-threshold');
    const edgeOpacity    = document.getElementById('edge-opacity');
    const edgeThresholdVal = document.getElementById('edge-threshold-val');
    const edgeOpacityVal = document.getElementById('edge-opacity-val');
    const edgeControls   = document.querySelector('.edge-controls');
    const edgeColorSwatches = document.querySelectorAll('.edge-color-swatch');

    // ── Line DOM elements ──
    const lineEls = [];

    function createLineElements() {
        for (let i = 0; i < 8; i++) {
            const el = document.createElement('div');
            const isV = lineOrient[i] === 'v';
            const isOuter = lineType[i] === 'outer';
            el.className = 'border-line ' + (isV ? 'vertical' : 'horizontal') + ' ' + lineType[i];
            el.dataset.idx = i;

            const hitArea = document.createElement('div');
            hitArea.className = 'hit-area';

            const lineVis = document.createElement('div');
            lineVis.className = 'line-visual';

            if (isV) {
                const capTop = document.createElement('div');
                capTop.className = 'cap cap-top';
                const capBot = document.createElement('div');
                capBot.className = 'cap cap-bottom';
                el.appendChild(capTop);
                el.appendChild(capBot);
            } else {
                const capLeft = document.createElement('div');
                capLeft.className = 'cap cap-left';
                const capRight = document.createElement('div');
                capRight.className = 'cap cap-right';
                el.appendChild(capLeft);
                el.appendChild(capRight);
            }

            el.appendChild(hitArea);
            el.appendChild(lineVis);
            viewport.appendChild(el);
            lineEls.push(el);
        }
    }

    createLineElements();

    // ── Image Loading ──
    function loadImage(src) {
        const img = new Image();
        img.onload = function () {
            imgNatW = img.naturalWidth;
            imgNatH = img.naturalHeight;
            cardImage.src = src;
            cardImage.style.width = imgNatW + 'px';
            cardImage.style.height = imgNatH + 'px';
            currentImageSrc = src;
            imageLoaded = true;
            edgeDirty = true;
            emptyState.classList.add('hidden');
            viewport.classList.add('active');
            initLinePositions();
            fitZoom();
            updateAll();
            if (edgeActive) computeEdgeOverlay();
        };
        img.src = src;
    }

    function initLinePositions() {
        // Outer at 2%, inner at 8%
        lines[0] = imgNatW * 0.02;  // outer-left
        lines[1] = imgNatW * 0.08;  // inner-left
        lines[2] = imgNatW * 0.92;  // inner-right
        lines[3] = imgNatW * 0.98;  // outer-right
        lines[4] = imgNatH * 0.02;  // outer-top
        lines[5] = imgNatH * 0.08;  // inner-top
        lines[6] = imgNatH * 0.92;  // inner-bottom
        lines[7] = imgNatH * 0.98;  // outer-bottom
    }

    // ── File input ──
    filePickBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = function (ev) { loadImage(ev.target.result); };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Paste
    document.addEventListener('paste', function (e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function (ev) { loadImage(ev.target.result); };
                reader.readAsDataURL(blob);
                return;
            }
        }
    });

    // Drag-and-drop
    workspace.addEventListener('dragover', function (e) {
        e.preventDefault();
        workspace.classList.add('drag-over');
    });
    workspace.addEventListener('dragleave', function () {
        workspace.classList.remove('drag-over');
    });
    workspace.addEventListener('drop', function (e) {
        e.preventDefault();
        workspace.classList.remove('drag-over');
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (ev) { loadImage(ev.target.result); };
            reader.readAsDataURL(file);
        }
    });

    // ── Zoom / Pan ──
    function fitZoom() {
        if (!imageLoaded) return;
        const vw = workspace.clientWidth;
        const vh = workspace.clientHeight;
        const pad = 40;
        zoom = Math.min((vw - pad) / imgNatW, (vh - pad) / imgNatH);
        panX = (vw - imgNatW * zoom) / 2;
        panY = (vh - imgNatH * zoom) / 2;
    }

    function clampZoom(z) {
        return Math.max(0.05, Math.min(50, z));
    }

    function applyTransform() {
        imgContainer.style.transform =
            'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
        var rotCss = 'rotate(' + (rotation / 10) + 'deg)';
        cardImage.style.transform = rotCss;
        cardImage.style.transformOrigin = 'center center';
        edgeOverlay.style.transform = rotCss;
        edgeOverlay.style.transformOrigin = 'center center';
        zoomLabel.textContent = 'Zoom: ' + zoom.toFixed(1) + 'x';
    }

    workspace.addEventListener('wheel', function (e) {
        if (!imageLoaded) return;
        e.preventDefault();
        const rect = workspace.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = clampZoom(zoom * factor);
        const ratio = newZoom / zoom;

        panX = mx - ratio * (mx - panX);
        panY = my - ratio * (my - panY);
        zoom = newZoom;
        updateAll();
    }, { passive: false });

    zoomInBtn.addEventListener('click', function () {
        if (!imageLoaded) return;
        const vw = workspace.clientWidth / 2;
        const vh = workspace.clientHeight / 2;
        const newZoom = clampZoom(zoom * 1.3);
        const ratio = newZoom / zoom;
        panX = vw - ratio * (vw - panX);
        panY = vh - ratio * (vh - panY);
        zoom = newZoom;
        updateAll();
    });

    zoomOutBtn.addEventListener('click', function () {
        if (!imageLoaded) return;
        const vw = workspace.clientWidth / 2;
        const vh = workspace.clientHeight / 2;
        const newZoom = clampZoom(zoom / 1.3);
        const ratio = newZoom / zoom;
        panX = vw - ratio * (vw - panX);
        panY = vh - ratio * (vh - panY);
        zoom = newZoom;
        updateAll();
    });

    zoomFitBtn.addEventListener('click', function () {
        fitZoom();
        updateAll();
    });

    // ── Pan via mouse drag on workspace background ──
    workspace.addEventListener('mousedown', function (e) {
        if (!imageLoaded) return;
        // Only pan if not clicking a line
        if (e.target.closest('.border-line')) return;
        if (e.button !== 0) return;
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartPanX = panX;
        panStartPanY = panY;
        workspace.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (isPanning) {
            panX = panStartPanX + (e.clientX - panStartX);
            panY = panStartPanY + (e.clientY - panStartY);
            updateAll();
        }
        if (draggingLine >= 0) {
            handleLineDrag(e);
        }
    });

    document.addEventListener('mouseup', function () {
        if (isPanning) {
            isPanning = false;
            workspace.style.cursor = '';
        }
        if (draggingLine >= 0) {
            draggingLine = -1;
            coordReadout.classList.add('hidden');
        }
    });

    // ── Line dragging ──
    viewport.addEventListener('mousedown', function (e) {
        const lineEl = e.target.closest('.border-line');
        if (!lineEl) return;
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(lineEl.dataset.idx);
        draggingLine = idx;
        selectedLineIdx = idx;
        updateLineSelection();

        if (lineOrient[idx] === 'v') {
            dragStartMouse = e.clientX;
        } else {
            dragStartMouse = e.clientY;
        }
        dragStartPos = lines[idx];
    });

    function handleLineDrag(e) {
        const idx = draggingLine;
        const isV = lineOrient[idx] === 'v';
        const mouseDelta = isV ? (e.clientX - dragStartMouse) : (e.clientY - dragStartMouse);
        const imgDelta = mouseDelta / zoom;
        lines[idx] = dragStartPos + imgDelta;

        // Show coordinate readout
        coordReadout.classList.remove('hidden');
        coordReadout.style.left = (e.clientX + 14) + 'px';
        coordReadout.style.top = (e.clientY - 10) + 'px';
        const label = isV ? 'x' : 'y';
        coordReadout.textContent = label + ': ' + lines[idx].toFixed(1) + 'px';

        updateAll();
    }

    function updateLineSelection() {
        for (let i = 0; i < 8; i++) {
            lineEls[i].classList.toggle('selected', i === selectedLineIdx);
        }
    }

    // ── Rendering ──
    function updateAll() {
        applyTransform();
        updateLines();
        updateMeasurements();
    }

    function updateLines() {
        for (let i = 0; i < 8; i++) {
            const el = lineEls[i];
            if (lineOrient[i] === 'v') {
                const screenX = panX + lines[i] * zoom;
                el.style.left = screenX + 'px';
                el.style.top = '0';
            } else {
                const screenY = panY + lines[i] * zoom;
                el.style.top = screenY + 'px';
                el.style.left = '0';
            }
        }
    }

    function updateMeasurements() {
        if (!imageLoaded) {
            lrRatio.textContent = '--.- : --.-';
            tbRatio.textContent = '--.- : --.-';
            lrGauge.style.width = '50%';
            lrGauge.className = 'gauge-fill';
            tbGauge.style.width = '50%';
            tbGauge.className = 'gauge-fill';
            lrLeftPx.textContent = 'L: --';
            lrRightPx.textContent = 'R: --';
            tbTopPx.textContent = 'T: --';
            tbBottomPx.textContent = 'B: --';
            return;
        }
        const leftW = lines[1] - lines[0];   // inner-left − outer-left
        const rightW = lines[3] - lines[2];  // outer-right − inner-right
        const topH = lines[5] - lines[4];    // inner-top − outer-top
        const bottomH = lines[7] - lines[6]; // outer-bottom − inner-bottom

        // L/R
        if (leftW <= 0 || rightW <= 0) {
            lrRatio.textContent = '--.- : --.-';
            lrGauge.style.width = '50%';
            lrGauge.className = 'gauge-fill';
        } else {
            const total = leftW + rightW;
            const lPct = (leftW / total) * 100;
            const rPct = (rightW / total) * 100;
            lrRatio.textContent = lPct.toFixed(1) + ' : ' + rPct.toFixed(1);
            lrGauge.style.width = lPct.toFixed(1) + '%';
            lrGauge.className = 'gauge-fill' + gaugeClass(lPct);
        }
        lrLeftPx.textContent = 'L: ' + leftW.toFixed(1) + 'px';
        lrRightPx.textContent = 'R: ' + rightW.toFixed(1) + 'px';

        // T/B
        if (topH <= 0 || bottomH <= 0) {
            tbRatio.textContent = '--.- : --.-';
            tbGauge.style.width = '50%';
            tbGauge.className = 'gauge-fill';
        } else {
            const total = topH + bottomH;
            const tPct = (topH / total) * 100;
            const bPct = (bottomH / total) * 100;
            tbRatio.textContent = tPct.toFixed(1) + ' : ' + bPct.toFixed(1);
            tbGauge.style.width = tPct.toFixed(1) + '%';
            tbGauge.className = 'gauge-fill' + gaugeClass(tPct);
        }
        tbTopPx.textContent = 'T: ' + topH.toFixed(1) + 'px';
        tbBottomPx.textContent = 'B: ' + bottomH.toFixed(1) + 'px';
    }

    function gaugeClass(pct) {
        const off = Math.abs(pct - 50);
        if (off > 10) return ' bad';
        if (off > 5) return ' off-center';
        return '';
    }

    // ── Rotation ──
    rotSlider.addEventListener('input', function () {
        rotation = parseInt(rotSlider.value);
        rotValue.textContent = (rotation / 10).toFixed(1) + '\u00B0';
        updateAll();
    });

    rotReset.addEventListener('click', resetRotation);

    function resetRotation() {
        rotation = 0;
        rotSlider.value = 0;
        rotValue.textContent = '0.0\u00B0';
        updateAll();
    }

    // ── Keyboard ──
    document.addEventListener('keydown', function (e) {
        const key = e.key;

        // Esc = clear image (works even with no image)
        if (key === 'Escape') {
            if (imageLoaded) resetImage();
            e.preventDefault();
            return;
        }

        if (!imageLoaded) return;

        // Number keys 1-8 select a line
        if (key >= '1' && key <= '8' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            selectedLineIdx = parseInt(key) - 1;
            updateLineSelection();
            e.preventDefault();
            return;
        }

        // F = fit
        if (key === 'f' || key === 'F') {
            if (e.ctrlKey || e.metaKey) return; // don't intercept Ctrl+F
            fitZoom();
            updateAll();
            e.preventDefault();
            return;
        }

        // E = toggle edge detection
        if ((key === 'e' || key === 'E') && !e.ctrlKey && !e.metaKey) {
            toggleEdge();
            e.preventDefault();
            return;
        }

        // R = reset rotation
        if ((key === 'r' || key === 'R') && !e.ctrlKey && !e.metaKey) {
            resetRotation();
            e.preventDefault();
            return;
        }

        // Arrow keys nudge selected line
        if (selectedLineIdx >= 0 && (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown')) {
            e.preventDefault();
            const idx = selectedLineIdx;
            const isV = lineOrient[idx] === 'v';
            const amount = e.shiftKey ? 0.1 : 1;

            if (isV) {
                if (key === 'ArrowLeft') lines[idx] -= amount;
                if (key === 'ArrowRight') lines[idx] += amount;
            } else {
                if (key === 'ArrowUp') lines[idx] -= amount;
                if (key === 'ArrowDown') lines[idx] += amount;
            }
            updateAll();
        }
    });

    // ── Reset Image ──
    function resetImage() {
        imageLoaded = false;
        imgNatW = 0;
        imgNatH = 0;
        zoom = 1;
        panX = 0;
        panY = 0;
        selectedLineIdx = -1;
        draggingLine = -1;
        cardImage.src = '';
        cardImage.style.width = '';
        cardImage.style.height = '';
        cardImage.style.transform = '';
        cardImage.style.filter = '';
        imgContainer.style.transform = '';
        viewport.classList.remove('active');
        emptyState.classList.remove('hidden');
        zoomLabel.textContent = 'Zoom: 1.0x';
        fileInput.value = '';
        // Reset rotation
        resetRotation();
        // Reset filters
        resetFilters();
        // Reset edge detection
        resetEdge();
        // Reset line selection
        updateLineSelection();
        currentImageSrc = null;
    }

    resetImageBtn.addEventListener('click', resetImage);

    // ── Image Filters ──
    function applyFilters() {
        const c = filterContrast.value;
        const b = filterBrightness.value;
        const s = filterSaturation.value;
        cardImage.style.filter =
            'contrast(' + c + '%) brightness(' + b + '%) saturate(' + s + '%)';
        filterContrastVal.textContent = c + '%';
        filterBrightnessVal.textContent = b + '%';
        filterSaturationVal.textContent = s + '%';
    }

    function resetFilters() {
        filterContrast.value = 100;
        filterBrightness.value = 100;
        filterSaturation.value = 100;
        filterContrastVal.textContent = '100%';
        filterBrightnessVal.textContent = '100%';
        filterSaturationVal.textContent = '100%';
        cardImage.style.filter = '';
    }

    filterContrast.addEventListener('input', applyFilters);
    filterBrightness.addEventListener('input', applyFilters);
    filterSaturation.addEventListener('input', applyFilters);
    filterResetBtn.addEventListener('click', resetFilters);

    // ── Edge Detection ──
    var edgeCanvas = document.createElement('canvas');
    var edgeCtx = edgeCanvas.getContext('2d', { willReadFrequently: true });

    function toggleEdge() {
        edgeActive = !edgeActive;
        edgeToggleBtn.textContent = edgeActive ? 'On' : 'Off';
        edgeToggleBtn.classList.toggle('active', edgeActive);
        edgeControls.classList.toggle('enabled', edgeActive);
        if (edgeActive && imageLoaded) {
            computeEdgeOverlay();
        } else {
            edgeOverlay.classList.remove('active');
        }
    }

    edgeToggleBtn.addEventListener('click', toggleEdge);

    function computeEdgeOverlay() {
        if (!imageLoaded || !currentImageSrc) return;

        var mode = edgeMode.value;
        var thresh = parseInt(edgeThreshold.value);
        var opacity = parseInt(edgeOpacity.value) / 100;
        var cr = edgeColor[0], cg = edgeColor[1], cb = edgeColor[2];

        // Draw original image to canvas at natural size
        // For large images, downsample to max 2000px for performance
        var scale = 1;
        var maxDim = 2000;
        if (imgNatW > maxDim || imgNatH > maxDim) {
            scale = maxDim / Math.max(imgNatW, imgNatH);
        }
        var w = Math.round(imgNatW * scale);
        var h = Math.round(imgNatH * scale);

        edgeCanvas.width = w;
        edgeCanvas.height = h;

        var img = new Image();
        img.onload = function () {
            edgeCtx.drawImage(img, 0, 0, w, h);
            var srcData = edgeCtx.getImageData(0, 0, w, h);
            var src = srcData.data;

            // Convert to grayscale luminance array
            var gray = new Float32Array(w * h);
            for (var i = 0; i < w * h; i++) {
                var r = src[i * 4];
                var g = src[i * 4 + 1];
                var b = src[i * 4 + 2];
                gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
            }

            // Sobel kernels
            var outData = edgeCtx.createImageData(w, h);
            var out = outData.data;

            for (var y = 1; y < h - 1; y++) {
                for (var x = 1; x < w - 1; x++) {
                    var idx = y * w + x;

                    // 3x3 neighborhood
                    var tl = gray[(y-1)*w + (x-1)];
                    var t  = gray[(y-1)*w + x];
                    var tr = gray[(y-1)*w + (x+1)];
                    var ml = gray[y*w + (x-1)];
                    var mr = gray[y*w + (x+1)];
                    var bl = gray[(y+1)*w + (x-1)];
                    var bm = gray[(y+1)*w + x];
                    var br = gray[(y+1)*w + (x+1)];

                    // Sobel Gx (vertical edges) and Gy (horizontal edges)
                    var gx = -tl + tr - 2*ml + 2*mr - bl + br;
                    var gy = -tl - 2*t - tr + bl + 2*bm + br;

                    var mag;
                    if (mode === 'horizontal') {
                        mag = Math.abs(gy);
                    } else if (mode === 'vertical') {
                        mag = Math.abs(gx);
                    } else {
                        mag = Math.sqrt(gx * gx + gy * gy);
                    }

                    // Apply threshold
                    var threshVal = thresh * 2.55; // map 0-100 to 0-255ish
                    if (mag < threshVal) mag = 0;

                    // For "strong" mode, apply extra contrast
                    if (mode === 'strong') {
                        mag = mag > threshVal ? Math.min(255, mag * 2) : 0;
                    }

                    // Clamp
                    var v = Math.min(255, mag);

                    var oi = idx * 4;
                    out[oi]     = Math.round((cr / 255) * v);
                    out[oi + 1] = Math.round((cg / 255) * v);
                    out[oi + 2] = Math.round((cb / 255) * v);
                    out[oi + 3] = Math.round(v * opacity);
                }
            }

            edgeCtx.putImageData(outData, 0, 0);
            edgeOverlay.src = edgeCanvas.toDataURL('image/png');
            edgeOverlay.style.width = imgNatW + 'px';
            edgeOverlay.style.height = imgNatH + 'px';
            edgeOverlay.style.opacity = '1';
            edgeOverlay.classList.add('active');
            edgeDirty = false;
        };
        img.src = currentImageSrc;
    }

    // Debounce helper for heavy recomputes
    var edgeDebounceTimer = null;
    function debouncedEdgeCompute() {
        if (edgeDebounceTimer) clearTimeout(edgeDebounceTimer);
        edgeDebounceTimer = setTimeout(function () {
            if (edgeActive && edgeDirty) computeEdgeOverlay();
        }, 80);
    }

    // Edge controls
    edgeMode.addEventListener('change', function () {
        edgeDirty = true;
        if (edgeActive) computeEdgeOverlay();
    });

    edgeThreshold.addEventListener('input', function () {
        edgeThresholdVal.textContent = edgeThreshold.value;
        edgeDirty = true;
        debouncedEdgeCompute();
    });

    edgeOpacity.addEventListener('input', function () {
        edgeOpacityVal.textContent = edgeOpacity.value + '%';
        edgeDirty = true;
        debouncedEdgeCompute();
    });

    // Edge color swatches
    var colorMap = {
        green:  [0, 255, 136],
        white:  [255, 255, 255],
        cyan:   [0, 204, 255],
        yellow: [255, 238, 0],
        red:    [255, 68, 68]
    };

    edgeColorSwatches.forEach(function (swatch) {
        swatch.addEventListener('click', function () {
            edgeColorSwatches.forEach(function (s) { s.classList.remove('active'); });
            swatch.classList.add('active');
            edgeColor = colorMap[swatch.dataset.color] || [0, 255, 136];
            edgeDirty = true;
            if (edgeActive) computeEdgeOverlay();
        });
    });

    function resetEdge() {
        edgeActive = false;
        edgeDirty = true;
        edgeToggleBtn.textContent = 'Off';
        edgeToggleBtn.classList.remove('active');
        edgeControls.classList.remove('enabled');
        edgeOverlay.classList.remove('active');
        edgeOverlay.src = '';
        edgeMode.value = 'sobel';
        edgeThreshold.value = 15;
        edgeThresholdVal.textContent = '15';
        edgeOpacity.value = 85;
        edgeOpacityVal.textContent = '85%';
        edgeColor = [0, 255, 136];
        edgeColorSwatches.forEach(function (s) { s.classList.remove('active'); });
        edgeColorSwatches[0].classList.add('active');
    }

    // ── Initial state ──
    updateAll();
})();
