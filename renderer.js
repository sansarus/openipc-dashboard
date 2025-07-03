document.addEventListener('DOMContentLoaded', () => {
    let cameras = [];
    let groups = [];
    let gridCols = 2;
    let gridRows = 2;
    let gridCellsState = [];
    let fullscreenCellIndex = null;
    let editingCameraId = null;
    let settingsCameraId = null;
    let initialSettings = null; 

    // --- UI Elements ---
    const gridContainer = document.getElementById('grid-container');
    const cameraListContainer = document.getElementById('camera-list-container');
    const layoutControls = document.getElementById('layout-controls');
    const statusInfoEl = document.getElementById('status-info');
    const addCameraSidebarBtn = document.getElementById('add-camera-sidebar-btn');
    const addGroupBtn = document.getElementById('add-group-btn');
    
    // Camera Modal
    const addModal = document.getElementById('add-camera-modal');
    const saveCameraBtn = document.getElementById('save-camera-btn');
    const cancelAddBtn = document.getElementById('cancel-camera-btn');
    const addModalCloseBtn = document.getElementById('add-modal-close-btn');

    // Group Modal
    const addGroupModal = document.getElementById('add-group-modal');
    const newGroupNameInput = document.getElementById('new-group-name');
    const saveGroupBtn = document.getElementById('save-group-btn');
    const cancelGroupBtn = document.getElementById('cancel-group-btn');
    const addGroupModalCloseBtn = document.getElementById('add-group-modal-close-btn');

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const restartMajesticBtn = document.getElementById('restart-majestic-btn');
    const killAllBtnModal = document.getElementById('kill-all-btn-modal');
    const settingsToast = document.getElementById('settings-toast');
    let toastTimeout;

    // --- Utility Functions ---
    const openModal = (modalElement) => modalElement.classList.remove('hidden');
    const closeModal = (modalElement) => modalElement.classList.add('hidden');

    function showToast(message, isError = false) {
        if (toastTimeout) clearTimeout(toastTimeout);
        settingsToast.textContent = message;
        settingsToast.className = 'toast-notification';
        if (isError) settingsToast.classList.add('error');
        settingsToast.classList.add('show');
        toastTimeout = setTimeout(() => {
            settingsToast.classList.remove('show');
        }, 3000);
    }
    
    function getNestedValue(obj, path) {
        if (!path || !obj) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    function setFormValue(id, value) {
        const element = document.querySelector(`[id="${id}"]`);
        if (!element || value === undefined) return;
        if (element.type === 'checkbox') {
            element.checked = value === true || value === 'true';
        } else {
            element.value = value;
        }
    }
    
    // --- Initialization ---
    function initializeLayoutControls() {
        const layouts = ["1x1", "2x2", "3x3", "4x4", "5x5", "6x6", "8x4"];
        layouts.forEach(layout => {
            const btn = document.createElement('button');
            btn.className = 'layout-btn';
            btn.dataset.layout = layout;
            btn.textContent = layout.split('x').reduce((a, b) => a * b, 1);
            btn.title = `Раскладка ${layout}`;
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

    async function updateSystemStats() {
        try {
            const stats = await window.api.getSystemStats();
            statusInfoEl.textContent = `CPU: ${stats.cpu}% | RAM: ${stats.ram}MB`;
        } catch (error) {
            console.error("Failed to get system stats:", error);
            statusInfoEl.textContent = "Stats unavailable";
        }
    }
    
    // --- Configuration Management ---
    async function saveConfiguration() {
        try {
            const config = {
                cameras: cameras,
                groups: groups,
                layout: { cols: gridCols, rows: gridRows },
                gridState: gridCellsState.map(state => {
                    if (!state || !state.camera) return null;
                    return { cameraId: state.camera.id, streamId: state.streamId };
                })
            };
            await window.api.saveConfiguration(config);
            console.log('Configuration saved.');
        } catch (error) {
            console.error('Failed to save configuration:', error);
        }
    }

    async function loadConfiguration() {
        console.log('Loading configuration...');
        const config = await window.api.loadConfiguration();
        
        cameras = Array.isArray(config.cameras) ? config.cameras : [];
        groups = Array.isArray(config.groups) ? config.groups : [];
        const layout = config.layout || { cols: 2, rows: 2 };
        
        console.log(`Loaded ${cameras.length} cameras and ${groups.length} groups.`);

        gridCols = layout.cols;
        gridRows = layout.rows;
        gridCellsState = Array(gridCols * gridRows).fill(null);

        const savedGridState = Array.isArray(config.gridState) ? config.gridState : [];
        
        savedGridState.forEach((state, index) => {
            if (index < gridCellsState.length && state && state.cameraId) {
                const camera = cameras.find(c => c.id === state.cameraId);
                if (camera) {
                    gridCellsState[index] = {
                        camera,
                        player: null,
                        streamId: state.streamId
                    };
                }
            }
        });
        
        await renderGrid();
        renderCameraList();
    }
    
    // --- Grid and Camera Management ---
    function renderCameraList() {
        cameraListContainer.innerHTML = '';
    
        const createGroupHTML = (group, camerasInGroup) => {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'group-container';
    
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.innerHTML = `<i class="material-icons toggle-icon">arrow_drop_down</i><span class="group-name">${group.name}</span>`;
    
            const groupCamerasList = document.createElement('div');
            groupCamerasList.className = 'group-cameras';
    
            camerasInGroup.forEach(camera => {
                const cameraItem = document.createElement('div');
                cameraItem.className = 'camera-item';
                cameraItem.dataset.cameraId = camera.id;
                cameraItem.draggable = true;
                cameraItem.innerHTML = `<i class="status-icon" id="status-icon-${camera.id}"></i><span>${camera.name}</span>`;
                cameraItem.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', camera.id); });
                groupCamerasList.appendChild(cameraItem);
            });
    
            groupContainer.appendChild(groupHeader);
            groupContainer.appendChild(groupCamerasList);
    
            groupHeader.addEventListener('click', () => {
                groupHeader.querySelector('.toggle-icon').classList.toggle('collapsed');
                groupCamerasList.classList.toggle('collapsed');
            });
    
            if (group.id !== null) {
                 groupHeader.addEventListener('dragover', (e) => { e.preventDefault(); groupHeader.style.backgroundColor = 'var(--accent-color)'; });
                 groupHeader.addEventListener('dragleave', (e) => { groupHeader.style.backgroundColor = ''; });
                 groupHeader.addEventListener('drop', (e) => {
                    e.preventDefault();
                    groupHeader.style.backgroundColor = '';
                    const cameraId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    const camera = cameras.find(c => c.id === cameraId);
                    if (camera && camera.groupId !== group.id) {
                        camera.groupId = group.id;
                        saveConfiguration();
                        renderCameraList();
                    }
                });
            }
    
            return groupContainer;
        };

        groups.forEach(group => {
            const camerasInGroup = cameras.filter(c => c.groupId === group.id);
            cameraListContainer.appendChild(createGroupHTML(group, camerasInGroup));
        });

        const ungroupedCameras = cameras.filter(c => !c.groupId);
        if (ungroupedCameras.length > 0) {
            const ungroupedPseudoGroup = { id: null, name: 'Камеры без группы' };
            cameraListContainer.appendChild(createGroupHTML(ungroupedPseudoGroup, ungroupedCameras));
        }

        if (cameraListContainer.innerHTML === '') {
            cameraListContainer.innerHTML = '<p style="padding: 10px; color: var(--text-secondary);">Камер и групп нет.</p>';
        }

        pollCameraStatuses();
    }

    function setupDragStartForCell(cell, index) {
        // Удаляем старый обработчик, чтобы избежать дублирования
        if (cell._dragStartHandler) {
            cell.removeEventListener('dragstart', cell._dragStartHandler);
        }
        
        // Создаем и сохраняем новый обработчик
        cell._dragStartHandler = (e) => {
            e.dataTransfer.setData("application/x-grid-cell-index", index);
            e.dataTransfer.effectAllowed = 'move';
        };
        
        cell.addEventListener('dragstart', cell._dragStartHandler);
    }

    function swapStreams(sourceIndex, targetIndex) {
        if (sourceIndex === targetIndex) return;

        const sourceCell = gridContainer.querySelector(`[data-cell-id='${sourceIndex}']`);
        const targetCell = gridContainer.querySelector(`[data-cell-id='${targetIndex}']`);

        // Меняем местами состояние в массиве
        [gridCellsState[sourceIndex], gridCellsState[targetIndex]] = [gridCellsState[targetIndex], gridCellsState[sourceIndex]];

        // Меняем местами DOM-содержимое ячеек
        const tempContainer = document.createDocumentFragment();
        while (sourceCell.firstChild) {
            tempContainer.appendChild(sourceCell.firstChild);
        }
        while (targetCell.firstChild) {
            sourceCell.appendChild(targetCell.firstChild);
        }
        while (tempContainer.firstChild) {
            targetCell.appendChild(tempContainer.firstChild);
        }

        const sourceState = gridCellsState[sourceIndex];
        const targetState = gridCellsState[targetIndex];

        // Обновляем перетаскиваемость и обработчики
        sourceCell.draggable = !!sourceState;
        if (sourceState) {
            setupDragStartForCell(sourceCell, sourceIndex);
        }

        targetCell.draggable = !!targetState;
        if (targetState) {
            setupDragStartForCell(targetCell, targetIndex);
        }
        
        // Обновляем классы и плейсхолдеры
        sourceCell.classList.toggle('active', !!sourceState);
        targetCell.classList.toggle('active', !!targetState);
        
        const placeholderHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>Перетащите камеру</span>`;
        if (!sourceState) sourceCell.innerHTML = placeholderHTML;
        if (!targetState) targetCell.innerHTML = placeholderHTML;

        saveConfiguration();
    }

    async function renderGrid() {
        gridContainer.innerHTML = '';
        const totalCells = gridCols * gridRows;

        gridContainer.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
        gridContainer.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;
        
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.cellId = i;
            cell.addEventListener('dblclick', () => toggleFullscreen(i));
            cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
            cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
            
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                cell.classList.remove('drag-over');
                
                const sourceCellIndex = e.dataTransfer.getData("application/x-grid-cell-index");
                const targetCellIndex = i;

                if (sourceCellIndex !== "") {
                    // Перетаскивание из ячейки в ячейку
                    swapStreams(parseInt(sourceCellIndex, 10), targetCellIndex);
                } else {
                    // Перетаскивание из сайдбара
                    const cameraId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    startStreamInCell(targetCellIndex, cameraId);
                }
            });

            gridContainer.appendChild(cell);
            
            if (gridCellsState[i] && gridCellsState[i].camera) {
                startStreamInCell(i, gridCellsState[i].camera.id, gridCellsState[i].streamId);
            } else {
                cell.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>Перетащите камеру</span>`;
            }
        }
        updateActiveLayoutButton();
    }
    
    async function setGridLayout(cols, rows) {
        for (let i = 0; i < gridCellsState.length; i++) {
            if (gridCellsState[i]?.player) {
                await destroyPlayerInCell(i);
            }
        }

        gridCols = cols;
        gridRows = rows;
        const totalCells = cols * rows;
        
        const newGridState = Array(totalCells).fill(null);
        for(let i=0; i<Math.min(totalCells, gridCellsState.length); i++) {
            newGridState[i] = gridCellsState[i];
        }
        gridCellsState = newGridState;

        await renderGrid();
        saveConfiguration();
    }

    async function startStreamInCell(cellIndex, cameraId, streamId = null) {
        const camera = cameras.find(c => c.id === cameraId);
        if (!camera) return;

        const finalStreamId = streamId !== null ? streamId : (parseInt(camera.streamId, 10) || 1);

        if (gridCellsState[cellIndex] && gridCellsState[cellIndex].player) {
             await destroyPlayerInCell(cellIndex);
        }

        const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
        if (!cellElement) return;

        cellElement.innerHTML = `<span>Подключение...</span>`;
        cellElement.classList.add('active');
        cellElement.draggable = true;
        setupDragStartForCell(cellElement, cellIndex);

        const uniqueStreamIdentifier = `${camera.id}_${finalStreamId}`;
        gridCellsState[cellIndex] = { camera, streamId: finalStreamId, player: null, uniqueStreamIdentifier };
        saveConfiguration();
        
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
            controlsDiv.innerHTML = `<button class="audio-btn" title="Звук"><i class="material-icons">volume_off</i></button><button class="close-btn" title="Закрыть"><i class="material-icons">close</i></button>`;
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
            controlsDiv.querySelector('.close-btn').onclick = (e) => { 
                e.stopPropagation(); 
                stopStreamInCell(cellIndex, true); 
            };
            const audioBtn = controlsDiv.querySelector('.audio-btn');
            audioBtn.onclick = (e) => {
                e.stopPropagation();
                if (player.volume === 0) { player.volume = 1; audioBtn.innerHTML = '<i class="material-icons">volume_up</i>'; } 
                else { player.volume = 0; audioBtn.innerHTML = '<i class="material-icons">volume_off</i>'; }
            };
            gridCellsState[cellIndex].player = player;
        } else {
            cellElement.innerHTML = `<span>Ошибка: ${result.error || 'Неизвестная ошибка'}</span>`;
            cellElement.classList.remove('active');
            cellElement.draggable = false;
            gridCellsState[cellIndex] = null;
            saveConfiguration();
        }
    }
    
    async function destroyPlayerInCell(cellIndex) {
        const state = gridCellsState[cellIndex];
        if (!state || !state.player) return;
        await window.api.stopVideoStream(state.uniqueStreamIdentifier);
        state.player.destroy();
        state.player = null;
    }

    async function stopStreamInCell(cellIndex, clearCellUI = true) {
        await destroyPlayerInCell(cellIndex);
        if (gridCellsState[cellIndex]) {
            gridCellsState[cellIndex] = null;
            saveConfiguration();
        }
        if (clearCellUI) {
            const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
            if(cellElement) {
                cellElement.innerHTML = `<span><i class="material-icons placeholder-icon">add_photo_alternate</i><br>Перетащите камеру</span>`;
                cellElement.classList.remove('active');
                cellElement.draggable = false;
            }
        }
    }

    async function toggleFullscreen(cellIndex) {
        const currentState = gridCellsState[cellIndex];
        if (!currentState) return;
        const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
        const isEnteringFullscreen = !cellElement.classList.contains('fullscreen');
        const newStreamId = isEnteringFullscreen ? 0 : 1;
        
        if (newStreamId === currentState.streamId) {
            if (isEnteringFullscreen) {
                fullscreenCellIndex = cellIndex;
                gridContainer.classList.add('fullscreen-mode');
                cellElement.classList.add('fullscreen');
            } else {
                fullscreenCellIndex = null;
                gridContainer.classList.remove('fullscreen-mode');
                cellElement.classList.remove('fullscreen');
            }
            return;
        }
        
        const cameraId = currentState.camera.id;
        await destroyPlayerInCell(cellIndex);
        
        if (isEnteringFullscreen) {
            fullscreenCellIndex = cellIndex;
            gridContainer.classList.add('fullscreen-mode');
            cellElement.classList.add('fullscreen');
        } else {
            fullscreenCellIndex = null;
            gridContainer.classList.remove('fullscreen-mode');
            cellElement.classList.remove('fullscreen');
        }
        await startStreamInCell(cellIndex, cameraId, newStreamId);
    }
    
    function handleStreamDeath(uniqueStreamIdentifier) {
        const cellIndex = gridCellsState.findIndex(state => state && state.uniqueStreamIdentifier === uniqueStreamIdentifier);
        if (cellIndex !== -1) {
            const { camera, streamId } = gridCellsState[cellIndex];
            gridCellsState[cellIndex] = null;
            const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
            if (cellElement) {
                cellElement.innerHTML = `<span>Потеря связи.<br>Переподключение...</span>`;
            }
            setTimeout(() => startStreamInCell(cellIndex, camera.id, streamId), 5000);
        }
    }
    
    function openAddModal(cameraToEdit = null) {
        editingCameraId = cameraToEdit ? cameraToEdit.id : null;
        const modalTitle = document.getElementById('add-modal-title');
        const camera = cameraToEdit || {};
        modalTitle.textContent = cameraToEdit ? 'Редактировать камеру' : 'Добавить новую камеру';
        document.getElementById('new-cam-name').value = camera.name || '';
        document.getElementById('new-cam-ip').value = camera.ip || '';
        document.getElementById('new-cam-port').value = camera.port || '554';
        document.getElementById('new-cam-user').value = camera.username || 'root';
        document.getElementById('new-cam-pass').value = camera.password || '';
        document.getElementById('new-cam-stream').value = camera.streamId || '1';
        openModal(addModal);
        document.getElementById('new-cam-name').focus();
    }

    async function saveCameraBtnClick() {
        const cameraData = {
            name: document.getElementById('new-cam-name').value.trim(),
            ip: document.getElementById('new-cam-ip').value.trim(),
            port: document.getElementById('new-cam-port').value.trim(),
            username: document.getElementById('new-cam-user').value.trim(),
            password: document.getElementById('new-cam-pass').value,
            streamId: document.getElementById('new-cam-stream').value
        };
        if (!cameraData.name || !cameraData.ip) { alert('Название и IP-адрес обязательны!'); return; }
        if (editingCameraId) {
            const index = cameras.findIndex(c => c.id === editingCameraId);
            Object.assign(cameras[index], cameraData);
        } else {
            cameras.push({ id: Date.now(), groupId: null, ...cameraData });
        }
        await saveConfiguration();
        closeModal(addModal);
        renderCameraList();
        if (editingCameraId) {
            for(let i=0; i<gridCellsState.length; i++) {
                if(gridCellsState[i]?.camera.id === editingCameraId) {
                    const oldStreamId = gridCellsState[i].streamId;
                    await destroyPlayerInCell(i);
                    await startStreamInCell(i, editingCameraId, oldStreamId);
                }
            }
        }
    }

    async function deleteCamera(cameraId) {
        if (confirm('Вы уверены, что хотите удалить эту камеру?')) {
            for(let i = 0; i < gridCellsState.length; i++) {
                if(gridCellsState[i]?.camera.id === cameraId) {
                    await stopStreamInCell(i, true);
                }
            }
            cameras = cameras.filter(c => c.id !== cameraId);
            await saveConfiguration();
            renderCameraList();
        }
    }

    async function openSettingsModal(cameraId) {
        settingsCameraId = cameraId;
        const camera = cameras.find(c => c.id === cameraId);
        if (!camera) return;
        document.getElementById('settings-modal-title').textContent = `Настройки: ${camera.name}`;
        settingsModal.querySelectorAll('.tab-button').forEach((btn, idx) => btn.classList.toggle('active', idx === 0));
        settingsModal.querySelectorAll('.tab-content').forEach((content, idx) => content.classList.toggle('active', idx === 0));
        openModal(settingsModal);
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.textContent = 'Загрузка...';
        const settings = await window.api.getCameraSettings(camera);
        initialSettings = settings; 
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Сохранить';
        if (settings && !settings.error) {
            Object.keys(settings).forEach(section => {
                if (typeof settings[section] === 'object' && settings[section] !== null) {
                    Object.keys(settings[section]).forEach(key => {
                        setFormValue(`${section}.${key}`, settings[section][key]);
                    });
                }
            });
        } else {
            alert('Не удалось загрузить текущие настройки: ' + (settings?.error || 'Неизвестная ошибка'));
            closeModal(settingsModal);
        }
    }

    async function saveSettings() {
        if (settingsCameraId === null) return;
        const camera = cameras.find(c => c.id === settingsCameraId);
        if (!camera) return;
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.textContent = 'Сохранение...';
        const settingsData = {};
        const inputs = settingsModal.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (!input.id) return;
            const cgiName = '_' + input.id.replace(/\./g, '_');
            if (input.type === 'checkbox') {
                settingsData[cgiName] = input.checked ? 'true' : 'false';
            } else {
                settingsData[cgiName] = input.value.trim();
            }
        });
        const result = await window.api.setCameraSettings({ credentials: camera, settingsData });
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Сохранить';
        if (result.success) {
            showToast('Настройки успешно сохранены!');
            initialSettings = await window.api.getCameraSettings(camera);
        } else {
            showToast(`Ошибка сохранения: ${result.error}`, true);
        }
    }

    async function restartMajestic() {
        if (settingsCameraId === null) return;
        const camera = cameras.find(c => c.id === settingsCameraId);
        if (!camera) return;
        restartMajesticBtn.disabled = true;
        const result = await window.api.restartMajestic(camera);
        restartMajesticBtn.disabled = false;
        showToast(result.success ? 'Команда на перезапуск отправлена.' : `Ошибка: ${result.error}`, !result.success);
    }
    
    async function pollCameraStatuses() {
        for (const camera of cameras) {
            const statusIcon = document.getElementById(`status-icon-${camera.id}`);
            if (statusIcon) {
                const pulse = await window.api.getCameraPulse(camera);
                statusIcon.classList.toggle('online', pulse.success);
            }
        }
    }
    
    function openAddGroupModal() {
        newGroupNameInput.value = '';
        openModal(addGroupModal);
        newGroupNameInput.focus();
    }

    function saveNewGroup() {
        const name = newGroupNameInput.value.trim();
        if (!name) {
            alert('Название группы не может быть пустым.');
            return;
        }
        const newGroup = {
            id: `group_${Date.now()}`,
            name: name
        };
        groups.push(newGroup);
        saveConfiguration();
        renderCameraList();
        closeModal(addGroupModal);
    }

    // --- Event Listeners ---
    addCameraSidebarBtn.addEventListener('click', () => openAddModal());
    saveCameraBtn.addEventListener('click', saveCameraBtnClick);
    addModalCloseBtn.addEventListener('click', () => closeModal(addModal));
    cancelAddBtn.addEventListener('click', () => closeModal(addModal));
    addModal.addEventListener('click', (e) => { if (e.target === addModal) closeModal(addModal); });

    addGroupBtn.addEventListener('click', openAddGroupModal);
    saveGroupBtn.addEventListener('click', saveNewGroup);
    cancelGroupBtn.addEventListener('click', () => closeModal(addGroupModal));
    addGroupModalCloseBtn.addEventListener('click', () => closeModal(addGroupModal));
    addGroupModal.addEventListener('click', (e) => { if (e.target === addGroupModal) closeModal(addGroupModal); });
    
    settingsModalCloseBtn.addEventListener('click', () => closeModal(settingsModal));
    saveSettingsBtn.addEventListener('click', saveSettings);
    restartMajesticBtn.addEventListener('click', restartMajestic);
    killAllBtnModal.addEventListener('click', async () => {
         if (confirm('Это принудительно завершит все процессы ffmpeg. Используйте, если потоки зависли. Продолжить?')) {
            const result = await window.api.killAllFfmpeg();
            alert(result.message);
            window.location.reload();
        }
    });
    
    gridContainer.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.grid-cell');
        if (!cell) return;
        const cellIndex = parseInt(cell.dataset.cellId, 10);
        const state = gridCellsState[cellIndex];
        if (state && state.camera) {
            e.preventDefault();
            window.api.showCameraContextMenu(state.camera.id);
        }
    });

    window.api.onContextMenuCommand(({ command, cameraId }) => {
        const camera = cameras.find(c => c.id === cameraId);
        if (!camera) return;
        switch(command) {
            case 'files': window.api.openFileManager(camera); break;
            case 'ssh': window.api.openSshTerminal(camera); break;
            case 'settings': openSettingsModal(cameraId); break;
            case 'edit': openAddModal(camera); break;
            case 'delete': deleteCamera(cameraId); break;
        }
    });

    settingsModal.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            settingsModal.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active'));
            button.classList.add('active');
            const tabContent = document.getElementById(button.dataset.tab);
            if (tabContent) tabContent.classList.add('active');
        });
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(addModal);
            closeModal(settingsModal);
            closeModal(addGroupModal);
            if (fullscreenCellIndex !== null) {
                const cellElement = gridContainer.querySelector(`.grid-cell.fullscreen`);
                if(cellElement) toggleFullscreen(parseInt(cellElement.dataset.cellId, 10));
            }
        }
    });

    window.api.onStreamStats((stats) => {
        const statsElement = document.getElementById(`stats-${stats.uniqueStreamIdentifier}`);
        if (statsElement) {
            const fps = stats.fps.toFixed(1);
            const bitrate = stats.bitrate.toFixed(0);
            statsElement.textContent = `FPS: ${fps} | ${bitrate}kb/s`;
        }
    });
    
    window.api.onStreamDied((uniqueStreamIdentifier) => handleStreamDeath(uniqueStreamIdentifier));

    // --- Initial call ---
    initializeLayoutControls();
    loadConfiguration();
    setInterval(updateSystemStats, 2000);
    setInterval(pollCameraStatuses, 60000);
});