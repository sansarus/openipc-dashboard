// js/grid-manager.js (ФИНАЛЬНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ)

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createGridManager = function(App) {
        const gridContainer = document.getElementById('grid-container');
        const layoutControls = document.getElementById('layout-controls');
        const MAX_GRID_SIZE = 64;
        let reconnectTimers = {};
        const manuallyClosedStreams = new Set();

        let gridCols = 2;
        let gridRows = 2;
        let gridCellsState = Array(MAX_GRID_SIZE).fill(null);
        let fullscreenCellIndex = null;

        function updatePlaceholdersLanguage() {
            const placeholderHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.t('drop_camera_here')}</span>`;
            
            for (let i = 0; i < gridCellsState.length; i++) {
                if (gridCellsState[i] === null) {
                    const cell = gridContainer.querySelector(`[data-cell-id='${i}']`);
                    if (cell) {
                        cell.innerHTML = placeholderHTML;
                    }
                }
            }
        }

        function getGridSize() {
            return { cols: gridCols, rows: gridRows };
        }

        function getGridState() {
            return gridCellsState.map(cell => {
                if (!cell || !cell.camera) return null;
                return { camera: { id: cell.camera.id }, streamId: cell.streamId };
            });
        }
        
        function setInitialState(state) {
            gridCols = state.layout.cols;
            gridRows = state.layout.rows;
            // ИСПРАВЛЕНИЕ: Правильно инициализируем состояние при загрузке
            gridCellsState = state.gridState.map(s => s ? { ...s, player: null, uniqueStreamIdentifier: null } : null);
        }

        function initializeLayoutControls() {
            const layouts = ["1x1", "2x2", "3x3", "4x4", "5x5", "8x4","8x8"];
            layouts.forEach(layout => {
                const btn = document.createElement('button');
                btn.className = 'layout-btn';
                btn.dataset.layout = layout;
                btn.textContent = layout.split('x').reduce((a, b) => a * b, 1);
                btn.title = `Layout ${layout}`;
                btn.onclick = () => {
                    const [cols, rows] = layout.split('x').map(Number);
                    setGridLayout(cols, rows);
                };
                layoutControls.appendChild(btn);
            });
        }

        function updateActiveLayoutButton() {
            const currentLayout = `${gridCols}x${gridRows}`;
            layoutControls.querySelectorAll('.layout-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.layout === currentLayout);
            });
        }
        
        async function setGridLayout(cols, rows) {
            const oldVisibleSize = gridCols * gridRows;
            const newVisibleSize = cols * rows;
        
            gridCols = cols;
            gridRows = rows;
            
            if (newVisibleSize < oldVisibleSize) {
                for (let i = newVisibleSize; i < oldVisibleSize; i++) {
                    if (gridCellsState[i]) {
                        await stopStreamInCell(i, false); 
                    }
                }
            }
        
            updateGridLayoutView(); 
            App.saveConfiguration();
        }
        
        function updateGridLayoutView() {
            const totalVisibleCells = gridCols * gridRows;
            const cellWidth = 100 / gridCols;
            const cellHeight = 100 / gridRows;
        
            for (let i = 0; i < MAX_GRID_SIZE; i++) {
                const cell = gridContainer.children[i];
                if (cell) {
                    if (i < totalVisibleCells) {
                        const row = Math.floor(i / gridCols);
                        const col = i % gridCols;
                        
                        cell.style.display = 'flex';
                        cell.style.top = `${row * cellHeight}%`;
                        cell.style.left = `${col * cellWidth}%`;
                        cell.style.width = `${cellWidth}%`;
                        cell.style.height = `${cellHeight}%`;
                    } else {
                        cell.style.display = 'none';
                    }
                }
            }
            updateActiveLayoutButton();
        }
        
        async function render() {
            gridContainer.innerHTML = ''; 
            for (let i = 0; i < MAX_GRID_SIZE; i++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.cellId = i;
                cell.style.display = 'none';
                cell.ondblclick = () => toggleFullscreen(i);
                cell.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.t('drop_camera_here')}</span>`;
                cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
                cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
                cell.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    const sourceCellIndex = e.dataTransfer.getData("application/x-grid-cell-index");
                    const targetCellIndex = i;
                    if (sourceCellIndex !== "") {
                        swapStreams(parseInt(sourceCellIndex, 10), targetCellIndex);
                    } else {
                        const cameraId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        await startStreamInCell(targetCellIndex, cameraId);
                    }
                });
                gridContainer.appendChild(cell);
            }
            
            for (let i = 0; i < gridCols * gridRows; i++) {
                if (gridCellsState[i] && gridCellsState[i].camera) {
                    await startStreamInCell(i, gridCellsState[i].camera.id, gridCellsState[i].streamId);
                }
            }
            updateGridLayoutView();
        }

        function setupDragStartForCell(cell, index) {
            if (cell._dragStartHandler) cell.removeEventListener('dragstart', cell._dragStartHandler);
            cell._dragStartHandler = (e) => { e.dataTransfer.setData("application/x-grid-cell-index", index); e.dataTransfer.effectAllowed = 'move'; };
            cell.addEventListener('dragstart', cell._dragStartHandler);
        }

        function swapStreams(sourceIndex, targetIndex) {
            if (sourceIndex === targetIndex) return;
            const sourceCell = gridContainer.querySelector(`[data-cell-id='${sourceIndex}']`);
            const targetCell = gridContainer.querySelector(`[data-cell-id='${targetIndex}']`);
            [gridCellsState[sourceIndex], gridCellsState[targetIndex]] = [gridCellsState[targetIndex], gridCellsState[sourceIndex]];
            const tempContainer = document.createDocumentFragment();
            while (sourceCell.firstChild) { tempContainer.appendChild(sourceCell.firstChild); }
            while (targetCell.firstChild) { sourceCell.appendChild(targetCell.firstChild); }
            while (tempContainer.firstChild) { targetCell.appendChild(tempContainer.firstChild); }
            const sourceState = gridCellsState[sourceIndex];
            const targetState = gridCellsState[targetIndex];
            sourceCell.draggable = !!sourceState;
            if (sourceState) setupDragStartForCell(sourceCell, sourceIndex);
            targetCell.draggable = !!targetState;
            if (targetState) setupDragStartForCell(targetCell, targetIndex);
            sourceCell.classList.toggle('active', !!sourceState);
            targetCell.classList.toggle('active', !!targetState);
            const placeholderHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.t('drop_camera_here')}</span>`;
            if (!sourceState) sourceCell.innerHTML = placeholderHTML;
            if (!targetState) targetCell.innerHTML = placeholderHTML;
            App.saveConfiguration();
        }
        
        async function startStreamInCell(cellIndex, cameraId, streamId = null) {
            const camera = App.cameras.find(c => c.id === cameraId);
            if (!camera) return;
            const finalStreamId = streamId !== null ? streamId : 0;
            if (gridCellsState[cellIndex] && (gridCellsState[cellIndex].player || gridCellsState[cellIndex].uniqueStreamIdentifier)) {
                 await destroyPlayerInCell(cellIndex);
            }
            const cellElement = document.querySelector(`[data-cell-id='${cellIndex}']`);
            if (!cellElement) return;
            cellElement.innerHTML = `<span>${App.t('connecting')}</span>`;
            cellElement.classList.add('active');
            cellElement.draggable = true;
            setupDragStartForCell(cellElement, cellIndex);
            const uniqueStreamIdentifier = `${camera.id}_${finalStreamId}`;
            gridCellsState[cellIndex] = { camera, streamId: finalStreamId, player: null, uniqueStreamIdentifier };
            App.saveConfiguration();
            const result = await window.api.startVideoStream({ credentials: camera, streamId: finalStreamId });
            if (!gridCellsState[cellIndex] || gridCellsState[cellIndex].uniqueStreamIdentifier !== uniqueStreamIdentifier) {
                await window.api.stopVideoStream(uniqueStreamIdentifier);
                return;
            }
            if (result.success) {
                cellElement.innerHTML = ''; 
                const canvas = document.createElement('canvas');
                cellElement.appendChild(canvas);
                const qualityLabel = finalStreamId === 0 ? 'HD' : 'SD';
                const controlsDiv = document.createElement('div');
                controlsDiv.className = 'cell-controls';
                controlsDiv.innerHTML = `<button class="record-btn" title="Запись"><i class="material-icons">fiber_manual_record</i></button><button class="audio-btn" title="Звук"><i class="material-icons">volume_off</i></button><button class="stream-switch-btn" title="Переключить поток (HD/SD)"><i class="material-icons">hd</i></button><button class="fullscreen-btn" title="На весь экран"><i class="material-icons">fullscreen</i></button><button class="close-btn" title="Закрыть"><i class="material-icons">close</i></button>`;
                const nameDiv = document.createElement('div');
                nameDiv.className = 'cell-name';
                nameDiv.textContent = `${camera.name} (${qualityLabel})`;
                const statsDiv = document.createElement('div');
                statsDiv.className = 'cell-stats';
                statsDiv.id = `stats-${uniqueStreamIdentifier}`;
                cellElement.appendChild(controlsDiv);
                cellElement.appendChild(nameDiv);
                cellElement.appendChild(statsDiv);
                
                const player = new JSMpeg.Player(`ws://localhost:${result.wsPort}`, { canvas, autoplay: true, audio: true, volume: 0 });
                player.volume = 0;

                controlsDiv.querySelector('.fullscreen-btn').onclick = (e) => { e.stopPropagation(); toggleFullscreen(cellIndex); };
                controlsDiv.querySelector('.stream-switch-btn').onclick = (e) => { e.stopPropagation(); toggleStream(cellIndex); };
                controlsDiv.querySelector('.close-btn').onclick = (e) => { e.stopPropagation(); stopStreamInCell(cellIndex, true); };
                const audioBtn = controlsDiv.querySelector('.audio-btn');
                audioBtn.onclick = (e) => { e.stopPropagation(); if (player.volume === 0) { player.volume = 1; audioBtn.innerHTML = '<i class="material-icons">volume_up</i>'; } else { player.volume = 0; audioBtn.innerHTML = '<i class="material-icons">volume_off</i>'; } };
                const recordBtn = controlsDiv.querySelector('.record-btn');
                if (App.recordingStates[camera.id]) recordBtn.classList.add('recording');
                recordBtn.onclick = (e) => { e.stopPropagation(); App.toggleRecording(camera); };

                gridCellsState[cellIndex].player = player;
            } else {
                cellElement.innerHTML = `<span>${App.t('error')}: ${result.error || App.t('unknown_error')}</span>`;
                cellElement.classList.remove('active');
                cellElement.draggable = false;
                gridCellsState[cellIndex] = null;
                App.saveConfiguration();
            }
        }
        
        // --- ИСПРАВЛЕНИЕ 5: Упрощенная и надежная функция остановки потока ---
        async function stopStreamInCell(cellIndex, clearCellUI = true) {
            if (reconnectTimers[cellIndex]) {
                clearTimeout(reconnectTimers[cellIndex]);
                delete reconnectTimers[cellIndex];
            }
        
            const state = gridCellsState[cellIndex];
            if (!state) return;
        
            const { uniqueStreamIdentifier, camera } = state;
            const cameraId = camera.id;
        
            if (uniqueStreamIdentifier) {
                manuallyClosedStreams.add(uniqueStreamIdentifier);
            }
            
            // Сначала уничтожаем плеер и останавливаем ffmpeg
            await destroyPlayerInCell(cellIndex);
            
            // Затем проверяем, нужно ли остановить запись
            const isAnotherCellWithSameCam = gridCellsState.some(
                (s, idx) => idx !== cellIndex && s?.camera.id === cameraId
            );
            if (App.recordingStates[cameraId] && !isAnotherCellWithSameCam) {
                await window.api.stopRecording(cameraId);
            }
        
            // Обновляем состояние и UI в самом конце, когда все готово
            gridCellsState[cellIndex] = null;
            if (clearCellUI) {
                const cellElement = document.querySelector(`[data-cell-id='${cellIndex}']`);
                if(cellElement) {
                    cellElement.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.t('drop_camera_here')}</span>`;
                    cellElement.classList.remove('active');
                    cellElement.draggable = false;
                }
            }
            
            await App.saveConfiguration();
        }

        async function destroyPlayerInCell(cellIndex) {
            const state = gridCellsState[cellIndex];
            if (!state) return;
            if (state.player) {
                try { state.player.destroy(); } catch (e) { /* ignore */ }
                state.player = null;
            }
            if (state.uniqueStreamIdentifier) {
                await window.api.stopVideoStream(state.uniqueStreamIdentifier);
            }
        }
        
        // --- ИСПРАВЛЕНИЕ 6: Исправленная логика переключения потоков ---
        async function toggleStream(cellIndex) {
            const currentState = gridCellsState[cellIndex];
            if (!currentState || !currentState.camera) return;
            
            const newStreamId = currentState.streamId === 0 ? 1 : 0;
            const cameraId = currentState.camera.id;

            // Просто вызываем startStreamInCell. Он сам позаботится об очистке старого потока.
            await startStreamInCell(cellIndex, cameraId, newStreamId);
        }
        
        async function toggleFullscreen(cellIndex) {
            const cell = document.querySelector(`[data-cell-id='${cellIndex}']`);
            const state = gridCellsState[cellIndex];
            if (!cell || !state) return;
            const isCurrentlyFullscreen = cell.classList.contains('fullscreen');
            const fsBtnIcon = cell.querySelector('.fullscreen-btn i');

            if (isCurrentlyFullscreen) {
                gridContainer.classList.remove('fullscreen-mode');
                cell.classList.remove('fullscreen');
                if (fsBtnIcon) fsBtnIcon.textContent = 'fullscreen';
                fullscreenCellIndex = null;
            } else {
                if (fullscreenCellIndex !== null) {
                    const oldFullscreenCell = document.querySelector(`[data-cell-id='${fullscreenCellIndex}']`);
                    if(oldFullscreenCell) {
                         oldFullscreenCell.classList.remove('fullscreen');
                         const oldFsBtnIcon = oldFullscreenCell.querySelector('.fullscreen-btn i');
                         if(oldFsBtnIcon) oldFsBtnIcon.textContent = 'fullscreen';
                    }
                }
                fullscreenCellIndex = cellIndex;
                gridContainer.classList.add('fullscreen-mode');
                cell.classList.add('fullscreen');
                if (fsBtnIcon) fsBtnIcon.textContent = 'fullscreen_exit';
            }
        }
        
        function handleStreamDeath(uniqueStreamIdentifier) {
            if (manuallyClosedStreams.has(uniqueStreamIdentifier)) {
                manuallyClosedStreams.delete(uniqueStreamIdentifier);
                return;
            }
            const cellIndex = gridCellsState.findIndex(s => s?.uniqueStreamIdentifier === uniqueStreamIdentifier);
            if (cellIndex === -1) return;
            if (reconnectTimers[cellIndex]) clearTimeout(reconnectTimers[cellIndex]);
            const state = { ...gridCellsState[cellIndex] };
            if (!state.camera) return;
            const cellElement = document.querySelector(`[data-cell-id='${cellIndex}']`);
            if (cellElement) {
                cellElement.innerHTML = `<div style="text-align: center; padding: 10px;"><span>${App.t('stream_died_reconnecting')}</span><button class="cancel-reconnect-btn" style="display: block; margin: 10px auto 0; padding: 5px 10px;">${App.t('cancel_reconnect')}</button></div>`;
                cellElement.classList.remove('active');
                cellElement.draggable = false;
                const cancelButton = cellElement.querySelector('.cancel-reconnect-btn');
                if (cancelButton) {
                    cancelButton.onclick = (e) => { e.stopPropagation(); clearTimeout(reconnectTimers[cellIndex]); delete reconnectTimers[cellIndex]; stopStreamInCell(cellIndex, true); };
                }
            }
            gridCellsState[cellIndex] = null;
            reconnectTimers[cellIndex] = setTimeout(() => { delete reconnectTimers[cellIndex]; if (!gridCellsState[cellIndex]) { startStreamInCell(cellIndex, state.camera.id, state.streamId); } }, 5000);
        }
        
        function updateRecordingState(cameraId, isRecording) {
            document.querySelectorAll('.grid-cell').forEach(cell => {
                const cellIndex = parseInt(cell.dataset.cellId, 10);
                if (gridCellsState[cellIndex]?.camera.id === cameraId) {
                    const recordBtn = cell.querySelector('.record-btn');
                    if (recordBtn) recordBtn.classList.toggle('recording', isRecording);
                }
            });
        }

        async function restartStreamsForCamera(cameraId) {
            for (let i = 0; i < gridCellsState.length; i++) {
                if (gridCellsState[i]?.camera.id === cameraId) {
                    const oldStreamId = gridCellsState[i].streamId;
                    await stopStreamInCell(i, false);
                    await startStreamInCell(i, cameraId, oldStreamId);
                }
            }
        }

        function updateCameraNameInGrid(cameraId, newName) {
            for (let i = 0; i < gridCellsState.length; i++) {
                if (gridCellsState[i]?.camera.id === cameraId) {
                    const cell = document.querySelector(`[data-cell-id='${i}']`);
                    const nameDiv = cell.querySelector('.cell-name');
                    if (nameDiv) {
                        const qualityLabel = gridCellsState[i].streamId === 0 ? 'HD' : 'SD';
                        nameDiv.textContent = `${newName} (${qualityLabel})`;
                    }
                }
            }
        }

        async function removeStreamsForCamera(cameraId) {
            for(let i = 0; i < gridCellsState.length; i++) {
                if(gridCellsState[i]?.camera.id === cameraId) {
                    await stopStreamInCell(i, true);
                }
            }
        }

        function init() {
            initializeLayoutControls();
            gridContainer.addEventListener('contextmenu', (e) => {
                const cell = e.target.closest('.grid-cell');
                if (!cell) return;
                const cellIndex = parseInt(cell.dataset.cellId, 10);
                const state = gridCellsState[cellIndex];
                if (state && state.camera) {
                    e.preventDefault();
                    const labels = { open_in_browser: `🌐  ${App.t('context_open_in_browser')}`, files: `🗂️  ${App.t('context_file_manager')}`, ssh: `💻  ${App.t('context_ssh')}`, settings: `⚙️  ${App.t('context_settings')}`, edit: `✏️  ${App.t('context_edit')}`, delete: `🗑️  ${App.t('context_delete')}` };
                    window.api.showCameraContextMenu({ cameraId: state.camera.id, labels });
                }
            });
            window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fullscreenCellIndex !== null) { toggleFullscreen(fullscreenCellIndex); } });
            window.addEventListener('language-changed', updatePlaceholdersLanguage);
        }

        return { init, render, setInitialState, getGridSize, getGridState, handleStreamDeath, updateRecordingState, restartStreamsForCamera, updateCameraNameInGrid, removeStreamsForCamera, updatePlaceholdersLanguage }
    }
})(window);