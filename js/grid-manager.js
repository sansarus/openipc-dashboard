// js/grid-manager.js (Полная версия с изменениями для системы пользователей)

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createGridManager = function(App) {
        const stateManager = App.stateManager;
        const gridContainer = document.getElementById('grid-container');
        const layoutControls = document.getElementById('layout-controls');
        const MAX_GRID_SIZE = 64;
        
        let localPlayers = {};
        let gridCells = [];
        let fullscreenCellIndex = null;

        function getGridState() { return stateManager.state.gridState; }
        
        function updatePlaceholdersLanguage() {
            const placeholderHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.i18n.t('drop_camera_here')}</span>`;
            gridCells.forEach(cell => {
                const isOccupied = Object.values(localPlayers).some(p => p.cell === cell);
                if (!isOccupied) {
                    cell.innerHTML = placeholderHTML;
                }
            });
        }

        function initializeLayoutControls() {
            const layouts = ["1x1", "2x2", "3x3", "4x4", "5x5", "8x4", "8x8"];
            layouts.forEach(layout => {
                const btn = document.createElement('button');
                btn.className = 'layout-btn';
                btn.dataset.layout = layout;
                btn.textContent = layout.split('x').reduce((a, b) => a * b, 1);
                btn.title = `Layout ${layout}`;
                btn.onclick = () => {
                    const [cols, rows] = layout.split('x').map(Number);
                    stateManager.updateGridLayout({ cols, rows });
                };
                layoutControls.appendChild(btn);
            });
        }

        function updateActiveLayoutButton() {
            const { layout } = stateManager.state;
            const currentLayout = `${layout.cols}x${layout.rows}`;
            layoutControls.querySelectorAll('.layout-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.layout === currentLayout);
            });
        }
        
        function updateGridLayoutView() {
            const { layout } = stateManager.state;
            const totalVisibleCells = layout.cols * layout.rows;
            const cellWidth = 100 / layout.cols;
            const cellHeight = 100 / layout.rows;
        
            gridCells.forEach((cell, i) => {
                if (i < totalVisibleCells) {
                    const row = Math.floor(i / layout.cols);
                    const col = i % layout.cols;
                    cell.style.display = 'flex';
                    cell.style.top = `${row * cellHeight}%`;
                    cell.style.left = `${col * cellWidth}%`;
                    cell.style.width = `${cellWidth}%`;
                    cell.style.height = `${cellHeight}%`;
                } else {
                    const cellState = stateManager.state.gridState[i];
                    if (cellState) {
                        const uniqueId = `${cellState.camera.id}_${cellState.streamId}`;
                        if (localPlayers[uniqueId]) {
                             destroyPlayer(uniqueId);
                        }
                    }
                    cell.style.display = 'none';
                }
            });
            updateActiveLayoutButton();
        }

        async function destroyPlayer(id) {
            const playerData = localPlayers[id];
            if (!playerData) return;
            
            console.log(`[Grid] Destroying stream: ${id}`);
            if(playerData.cell) {
                 playerData.cell.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.i18n.t('drop_camera_here')}</span>`;
                 playerData.cell.classList.remove('active');
                 playerData.cell.draggable = false;
            }
            await window.api.stopVideoStream(id);
            if(playerData.player) { try { playerData.player.destroy(); } catch(e){} }
            delete localPlayers[id];
        }

        function attachControlEvents(cellElement, cellIndex) {
            const controls = cellElement.querySelector('.cell-controls');
            if (!controls) return;
            
            controls.querySelector('.fullscreen-btn').onclick = (e) => { e.stopPropagation(); toggleFullscreen(cellIndex); };
            controls.querySelector('.stream-switch-btn').onclick = (e) => { e.stopPropagation(); const newGrid = stateManager.state.gridState.map(g => g ? {...g} : null); if (newGrid[cellIndex]) { newGrid[cellIndex].streamId = newGrid[cellIndex].streamId === 0 ? 1 : 0; stateManager.updateGridState(newGrid); } };
            controls.querySelector('.close-btn').onclick = (e) => { e.stopPropagation(); const newGrid = stateManager.state.gridState.map(g => g ? {...g} : null); newGrid[cellIndex] = null; stateManager.updateGridState(newGrid); };

            const audioBtn = controls.querySelector('.audio-btn');
            const player = localPlayers[`${stateManager.state.gridState[cellIndex].camera.id}_${stateManager.state.gridState[cellIndex].streamId}`]?.player;
            if(player) {
                audioBtn.onclick = (e) => { e.stopPropagation(); if (player.volume === 0) { player.volume = 1; audioBtn.innerHTML = '<i class="material-icons">volume_up</i>'; } else { player.volume = 0; audioBtn.innerHTML = '<i class="material-icons">volume_off</i>'; } };
            }

            const recordBtn = controls.querySelector('.record-btn');
            const camera = stateManager.state.cameras.find(c => c.id === stateManager.state.gridState[cellIndex].camera.id);
            if (recordBtn && camera) {
                recordBtn.onclick = (e) => { e.stopPropagation(); App.toggleRecording(camera); };
            }
        }
        
        async function render() {
            updateGridLayoutView();
            const { gridState, cameras, recordingStates } = stateManager.state;
            const desiredStreams = new Set();
            if (gridState) {
                gridState.forEach(cell => { if (cell) desiredStreams.add(`${cell.camera.id}_${cell.streamId}`); });
            }
        
            for (const id in localPlayers) {
                if (!desiredStreams.has(id)) {
                    await destroyPlayer(id);
                }
            }
        
            const occupiedCells = new Set();
        
            for (let i = 0; i < gridState.length; i++) {
                const cellState = gridState[i];
                if (!cellState) continue;
        
                const cellElement = gridCells[i];
                occupiedCells.add(cellElement);
        
                const camera = cameras.find(c => c.id === cellState.camera.id);
                if (!camera) continue;
        
                const uniqueStreamIdentifier = `${camera.id}_${cellState.streamId}`;
        
                if (localPlayers[uniqueStreamIdentifier]) {
                    const playerInfo = localPlayers[uniqueStreamIdentifier];
                    if (playerInfo.cell !== cellElement) {
                        console.log(`[Grid] Moving player ${uniqueStreamIdentifier} to cell ${i}`);
                        const contentToMove = Array.from(playerInfo.cell.childNodes);
                        cellElement.innerHTML = '';
                        contentToMove.forEach(node => cellElement.appendChild(node));
                        playerInfo.cell = cellElement;
                    }
                } else {
                    cellElement.innerHTML = `<span>${App.i18n.t('connecting')}</span>`;
                    localPlayers[uniqueStreamIdentifier] = { player: null, cell: cellElement };
        
                    const result = await window.api.startVideoStream({ credentials: camera, streamId: cellState.streamId });
        
                    if (!localPlayers[uniqueStreamIdentifier]) {
                        await window.api.stopVideoStream(uniqueStreamIdentifier);
                        continue;
                    }
        
                    if (result.success) {
                        cellElement.innerHTML = '';
                        const canvas = document.createElement('canvas'); cellElement.appendChild(canvas);
                        const qualityLabel = cellState.streamId === 0 ? 'HD' : 'SD';
                        const controlsDiv = document.createElement('div'); controlsDiv.className = 'cell-controls';
                        controlsDiv.innerHTML = `<button class="record-btn" title="Запись"><i class="material-icons">fiber_manual_record</i></button><button class="audio-btn" title="Звук"><i class="material-icons">volume_off</i></button><button class="stream-switch-btn" title="Переключить поток (HD/SD)"><i class="material-icons">hd</i></button><button class="fullscreen-btn" title="На весь экран"><i class="material-icons">fullscreen</i></button><button class="close-btn" title="Закрыть"><i class="material-icons">close</i></button>`;
                        const nameDiv = document.createElement('div'); nameDiv.className = 'cell-name'; nameDiv.textContent = `${camera.name} (${qualityLabel})`;
                        const statsDiv = document.createElement('div'); statsDiv.className = 'cell-stats'; statsDiv.id = `stats-${uniqueStreamIdentifier}`;
                        cellElement.appendChild(controlsDiv); cellElement.appendChild(nameDiv); cellElement.appendChild(statsDiv);
        
                        const player = new JSMpeg.Player(`ws://localhost:${result.wsPort}`, { canvas, autoplay: true, audio: true, volume: 0, disableWebAssembly: true });
                        localPlayers[uniqueStreamIdentifier].player = player;
                    } else {
                        cellElement.innerHTML = `<span>${App.i18n.t('error')}: ${result.error || App.i18n.t('unknown_error')}</span>`;
                        delete localPlayers[uniqueStreamIdentifier];
                    }
                }
        
                attachControlEvents(cellElement, i);
                const recordBtn = cellElement.querySelector('.record-btn');
                if (recordBtn) recordBtn.classList.toggle('recording', !!recordingStates[camera.id]);
                
                cellElement.classList.add('active');
                // VVV ИЗМЕНЕНИЕ: Перетаскивание доступно только администратору VVV
                cellElement.draggable = App.stateManager.state.currentUser?.role === 'admin';
                // ^^^ КОНЕЦ ИЗМЕНЕНИЯ ^^^
                if (cellElement._dragStartHandler) cellElement.removeEventListener('dragstart', cellElement._dragStartHandler);
                cellElement._dragStartHandler = (e) => { e.dataTransfer.setData("application/x-grid-cell-index", i.toString()); e.dataTransfer.effectAllowed = 'move'; };
                cellElement.addEventListener('dragstart', cellElement._dragStartHandler);
            }
        
            gridCells.forEach(cell => {
                if (!occupiedCells.has(cell)) {
                    if (cell.classList.contains('active')) {
                        cell.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.i18n.t('drop_camera_here')}</span>`;
                        cell.classList.remove('active');
                        cell.draggable = false;
                    }
                }
            });
        }

        function toggleFullscreen(cellIndex) {
            const cell = gridCells[cellIndex];
            if (!cell) return;
            const isCurrentlyFullscreen = cell.classList.contains('fullscreen');
            const fsBtnIcon = cell.querySelector('.fullscreen-btn i');

            if (isCurrentlyFullscreen) {
                gridContainer.classList.remove('fullscreen-mode');
                cell.classList.remove('fullscreen');
                if (fsBtnIcon) fsBtnIcon.textContent = 'fullscreen';
                fullscreenCellIndex = null;
            } else {
                if (fullscreenCellIndex !== null) {
                    const oldFullscreenCell = gridCells[fullscreenCellIndex];
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
        
        function init() {
            for (let i = 0; i < MAX_GRID_SIZE; i++) {
                const cell = document.createElement('div'); cell.className = 'grid-cell'; cell.dataset.cellId = i;
                cell.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>${App.i18n.t('drop_camera_here')}</span>`;
                cell.ondblclick = () => toggleFullscreen(i);
                cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
                cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
                cell.addEventListener('drop', (e) => {
                    // VVV ИЗМЕНЕНИЕ: Блокируем drop для всех, кроме админа VVV
                    if (App.stateManager.state.currentUser?.role !== 'admin') {
                        e.preventDefault();
                        return;
                    }
                    // ^^^ КОНЕЦ ИЗМЕНЕНИЯ ^^^
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    const newGrid = stateManager.state.gridState.map(g => g ? {...g} : null);
                    const targetIndex = i; const sourceCellIndex = e.dataTransfer.getData("application/x-grid-cell-index");
                    if (sourceCellIndex) { const sourceIdx = parseInt(sourceCellIndex, 10); [newGrid[targetIndex], newGrid[sourceIdx]] = [newGrid[sourceIdx], newGrid[targetIndex]]; } 
                    else { const cameraId = parseInt(e.dataTransfer.getData('text/plain'), 10); newGrid[targetIndex] = { camera: { id: cameraId }, streamId: 0 }; }
                    stateManager.updateGridState(newGrid);
                });
                gridContainer.appendChild(cell);
                gridCells.push(cell);
            }
            initializeLayoutControls();
            
            window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fullscreenCellIndex !== null) { toggleFullscreen(fullscreenCellIndex); } });
            window.addEventListener('language-changed', updatePlaceholdersLanguage);
        }

        async function handleStreamDeath(uniqueStreamIdentifier) {
            console.log(`[Grid] Stream ${uniqueStreamIdentifier} died. Cleaning up.`);
            if (localPlayers[uniqueStreamIdentifier]) {
                const playerInfo = localPlayers[uniqueStreamIdentifier];
                if (playerInfo.cell) {
                    playerInfo.cell.innerHTML = `<span><i class="material-icons">error_outline</i><br>${App.i18n.t('stream_died_reconnecting')}</span>`;
                }
                delete localPlayers[uniqueStreamIdentifier];

                setTimeout(() => {
                    const currentState = App.stateManager.state.gridState;
                    const needsRestart = currentState.some(cell => cell && `${cell.camera.id}_${cell.streamId}` === uniqueStreamIdentifier);
                    if (needsRestart) {
                        console.log(`[Grid] Attempting to restart stream ${uniqueStreamIdentifier}.`);
                        App.gridManager.render();
                    }
                }, 5000);
            }
        }

        async function restartStreamsForCamera(cameraId) {
            console.log(`[Grid] Restarting streams for camera ID: ${cameraId}`);
            for (const id in localPlayers) {
                if (id.startsWith(`${cameraId}_`)) {
                    await destroyPlayer(id);
                }
            }
            render();
        }

        return { 
            init, 
            render, 
            getGridState, 
            updateGridLayoutView, 
            updatePlaceholdersLanguage, 
            handleStreamDeath,
            restartStreamsForCamera
        };
    }
})(window);