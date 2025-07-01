document.addEventListener('DOMContentLoaded', () => {
    let cameras = [];
    const GRID_SIZE = 4;
    let gridCellsState = Array(GRID_SIZE).fill(null);
    let fullscreenCellIndex = null;
    let editingCameraId = null;
    let settingsCameraId = null;
    
    let initialSettings = null; 

    const cameraListEl = document.getElementById('camera-list');
    const gridContainer = document.getElementById('grid-container');
    const addCameraBtn = document.getElementById('add-camera-btn');
    const killAllBtn = document.getElementById('kill-all-btn');
    
    const addModal = document.getElementById('add-camera-modal');
    const saveCameraBtn = document.getElementById('save-camera-btn');
    const cancelAddBtn = document.getElementById('cancel-camera-btn');
    const addModalCloseBtn = document.getElementById('add-modal-close-btn');

    const settingsModal = document.getElementById('settings-modal');
    const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const restartMajesticBtn = document.getElementById('restart-majestic-btn');
    const settingsToast = document.getElementById('settings-toast');
    let toastTimeout;


    const openModal = (modalElement) => modalElement.classList.remove('hidden');
    const closeModal = (modalElement) => modalElement.classList.add('hidden');

    function showToast(message, isError = false) {
        if (toastTimeout) clearTimeout(toastTimeout);
        settingsToast.textContent = message;
        settingsToast.className = 'toast-notification';
        if (isError) {
            settingsToast.classList.add('error');
        }
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
            // System
            setFormValue('system.webPort', getNestedValue(settings, 'system.webPort'));
            setFormValue('system.httpsPort', getNestedValue(settings, 'system.httpsPort'));
            setFormValue('system.httpsCertificate', getNestedValue(settings, 'system.httpsCertificate'));
            setFormValue('system.httpsCertificateKey', getNestedValue(settings, 'system.httpsCertificateKey'));
            setFormValue('system.logLevel', getNestedValue(settings, 'system.logLevel'));
            setFormValue('system.unsafe', getNestedValue(settings, 'system.unsafe'));
            setFormValue('system.buffer', getNestedValue(settings, 'system.buffer'));
            setFormValue('system.plugins', getNestedValue(settings, 'system.plugins'));
            
            // ISP
            setFormValue('isp.drc', getNestedValue(settings, 'isp.drc'));
            setFormValue('isp.sensorConfig', getNestedValue(settings, 'isp.sensorConfig'));
            setFormValue('isp.iqProfile', getNestedValue(settings, 'isp.iqProfile'));
            setFormValue('isp.antiFlicker', getNestedValue(settings, 'isp.antiFlicker'));
            setFormValue('isp.slowShutter', getNestedValue(settings, 'isp.slowShutter'));
            setFormValue('isp.rawMode', getNestedValue(settings, 'isp.rawMode'));
            setFormValue('isp.blkCnt', getNestedValue(settings, 'isp.blkCnt'));
            setFormValue('isp.memMode', getNestedValue(settings, 'isp.memMode'));
            setFormValue('isp.dis', getNestedValue(settings, 'isp.dis'));
            setFormValue('isp.mirror', getNestedValue(settings, 'isp.mirror'));
            setFormValue('isp.flip', getNestedValue(settings, 'isp.flip'));
            
            // Image
            setFormValue('image.mirror', getNestedValue(settings, 'image.mirror'));
            setFormValue('image.flip', getNestedValue(settings, 'image.flip'));
            setFormValue('image.rotate', getNestedValue(settings, 'image.rotate'));
            setFormValue('image.contrast', getNestedValue(settings, 'image.contrast'));
            setFormValue('image.hue', getNestedValue(settings, 'image.hue'));
            setFormValue('image.saturation', getNestedValue(settings, 'image.saturation'));
            setFormValue('image.luminance', getNestedValue(settings, 'image.luminance'));

            // Video0
            setFormValue('video0.enabled', getNestedValue(settings, 'video0.enabled'));
            setFormValue('video0.size', getNestedValue(settings, 'video0.size'));
            setFormValue('video0.codec', getNestedValue(settings, 'video0.codec'));
            setFormValue('video0.profile', getNestedValue(settings, 'video0.profile'));
            setFormValue('video0.fps', getNestedValue(settings, 'video0.fps'));
            setFormValue('video0.bitrate', getNestedValue(settings, 'video0.bitrate'));
            setFormValue('video0.rcMode', getNestedValue(settings, 'video0.rcMode'));
            setFormValue('video0.gopSize', getNestedValue(settings, 'video0.gopSize'));
            setFormValue('video0.gopMode', getNestedValue(settings, 'video0.gopMode'));
            setFormValue('video0.sliceUnits', getNestedValue(settings, 'video0.sliceUnits'));
            setFormValue('video0.crop', getNestedValue(settings, 'video0.crop'));
            
            // Video1
            setFormValue('video1.enabled', getNestedValue(settings, 'video1.enabled'));
            setFormValue('video1.size', getNestedValue(settings, 'video1.size'));
            setFormValue('video1.codec', getNestedValue(settings, 'video1.codec'));
            setFormValue('video1.profile', getNestedValue(settings, 'video1.profile'));
            setFormValue('video1.fps', getNestedValue(settings, 'video1.fps'));
            setFormValue('video1.bitrate', getNestedValue(settings, 'video1.bitrate'));
            setFormValue('video1.rcMode', getNestedValue(settings, 'video1.rcMode'));
            setFormValue('video1.gopSize', getNestedValue(settings, 'video1.gopSize'));
            setFormValue('video1.gopMode', getNestedValue(settings, 'video1.gopMode'));
            setFormValue('video1.sliceUnits', getNestedValue(settings, 'video1.sliceUnits'));
            setFormValue('video1.crop', getNestedValue(settings, 'video1.crop'));
            
            // JPEG
            setFormValue('jpeg.enabled', getNestedValue(settings, 'jpeg.enabled'));
            setFormValue('jpeg.size', getNestedValue(settings, 'jpeg.size'));
            setFormValue('jpeg.qfactor', getNestedValue(settings, 'jpeg.qfactor'));
            setFormValue('jpeg.fps', getNestedValue(settings, 'jpeg.fps'));
            setFormValue('jpeg.rtsp', getNestedValue(settings, 'jpeg.rtsp'));

            // OSD
            setFormValue('osd.enabled', getNestedValue(settings, 'osd.enabled'));
            setFormValue('osd.template', getNestedValue(settings, 'osd.template'));
            setFormValue('osd.font', getNestedValue(settings, 'osd.font'));
            setFormValue('osd.size', getNestedValue(settings, 'osd.size'));
            setFormValue('osd.posX', getNestedValue(settings, 'osd.posX'));
            setFormValue('osd.posY', getNestedValue(settings, 'osd.posY'));
            setFormValue('osd.privacyMasks', getNestedValue(settings, 'osd.privacyMasks'));
            
            // Audio
            setFormValue('audio.enabled', getNestedValue(settings, 'audio.enabled'));
            setFormValue('audio.codec', getNestedValue(settings, 'audio.codec'));
            setFormValue('audio.srate', getNestedValue(settings, 'audio.srate'));
            setFormValue('audio.volume', getNestedValue(settings, 'audio.volume'));
            setFormValue('audio.dual', getNestedValue(settings, 'audio.dual'));
            setFormValue('audio.outputEnabled', getNestedValue(settings, 'audio.outputEnabled'));
            setFormValue('audio.outputVolume', getNestedValue(settings, 'audio.outputVolume'));
            setFormValue('audio.speakerPin', getNestedValue(settings, 'audio.speakerPin'));
            setFormValue('audio.speakerPinInvert', getNestedValue(settings, 'audio.speakerPinInvert'));
            
            // Night
            setFormValue('nightMode.colorToGray', getNestedValue(settings, 'nightMode.colorToGray'));
            setFormValue('nightMode.irCutPin1', getNestedValue(settings, 'nightMode.irCutPin1'));
            setFormValue('nightMode.irCutSingleInvert', getNestedValue(settings, 'nightMode.irCutSingleInvert'));
            setFormValue('nightMode.irCutPin2', getNestedValue(settings, 'nightMode.irCutPin2'));
            setFormValue('nightMode.backlightPin', getNestedValue(settings, 'nightMode.backlightPin'));
            setFormValue('nightMode.overrideDrc', getNestedValue(settings, 'nightMode.overrideDrc'));
            setFormValue('nightMode.lightMonitor', getNestedValue(settings, 'nightMode.lightMonitor'));
            setFormValue('nightMode.lightSensorPin', getNestedValue(settings, 'nightMode.lightSensorPin'));
            setFormValue('nightMode.lightSensorInvert', getNestedValue(settings, 'nightMode.lightSensorInvert'));
            setFormValue('nightMode.monitorDelay', getNestedValue(settings, 'nightMode.monitorDelay'));
            setFormValue('nightMode.minThreshold', getNestedValue(settings, 'nightMode.minThreshold'));
            setFormValue('nightMode.maxThreshold', getNestedValue(settings, 'nightMode.maxThreshold'));
            
            // Motion
            setFormValue('motionDetect.enabled', getNestedValue(settings, 'motionDetect.enabled'));
            setFormValue('motionDetect.visualize', getNestedValue(settings, 'motionDetect.visualize'));
            setFormValue('motionDetect.debug', getNestedValue(settings, 'motionDetect.debug'));
            setFormValue('motionDetect.roi', getNestedValue(settings, 'motionDetect.roi'));

            // Record
            setFormValue('records.enabled', getNestedValue(settings, 'records.enabled'));
            setFormValue('records.path', getNestedValue(settings, 'records.path'));
            setFormValue('records.split', getNestedValue(settings, 'records.split'));
            setFormValue('records.maxUsage', getNestedValue(settings, 'records.maxUsage'));
            setFormValue('records.substream', getNestedValue(settings, 'records.substream'));

            // Outgoing
            setFormValue('outgoing.enabled', getNestedValue(settings, 'outgoing.enabled'));
            setFormValue('outgoing.server', getNestedValue(settings, 'outgoing.server'));
            setFormValue('outgoing.naluSize', getNestedValue(settings, 'outgoing.naluSize'));
            setFormValue('outgoing.substream', getNestedValue(settings, 'outgoing.substream'));
            
            // Other
            setFormValue('rtsp.enabled', getNestedValue(settings, 'rtsp.enabled'));
            setFormValue('rtsp.port', getNestedValue(settings, 'rtsp.port'));
            setFormValue('watchdog.enabled', getNestedValue(settings, 'watchdog.enabled'));
            setFormValue('watchdog.timeout', getNestedValue(settings, 'watchdog.timeout'));
            setFormValue('hls.enabled', getNestedValue(settings, 'hls.enabled'));
            setFormValue('onvif.enabled', getNestedValue(settings, 'onvif.enabled'));
            setFormValue('ipeye.enabled', getNestedValue(settings, 'ipeye.enabled'));
            setFormValue('ipeye.uuid', getNestedValue(settings, 'ipeye.uuid'));
            setFormValue('netip.enabled', getNestedValue(settings, 'netip.enabled'));
            setFormValue('netip.user', getNestedValue(settings, 'netip.user'));
            setFormValue('netip.password', getNestedValue(settings, 'netip.password'));
            setFormValue('netip.port', getNestedValue(settings, 'netip.port'));
            setFormValue('netip.snapshots', getNestedValue(settings, 'netip.snapshots'));
            setFormValue('netip.ignoreSetTime', getNestedValue(settings, 'netip.ignoreSetTime'));

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
        
        console.log("Generated CGI data:", settingsData);
        
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
    
    async function saveCamerasToFile() {
        await window.api.saveCameras(cameras);
    }
    
    async function loadCamerasFromFile() {
        const loadedCameras = await window.api.loadCameras();
        cameras = Array.isArray(loadedCameras) ? loadedCameras : [];
        renderCameraList();
        pollAllCamerasStatus(true);
    }

    function renderCameraList() {
        cameraListEl.innerHTML = '';
        cameras.forEach(camera => {
            const li = document.createElement('li');
            li.dataset.id = camera.id;
            if (gridCellsState.some(state => state && state.camera.id === camera.id)) { li.classList.add('active-in-grid'); }
            
            li.innerHTML = `
                <i class="status-icon" id="status-icon-${camera.id}"></i>
                <div class="camera-info">
                    <div class="camera-name-text">${camera.name}</div>
                    <div class="camera-details" id="details-${camera.id}">
                        ${camera.ip || ''}
                    </div>
                </div>
                <div class="camera-temp" id="temp-${camera.id}"></div>
                <div class="item-controls">
                    <button class="menu-btn" title="Меню">⋮</button>
                </div>
            `;
            cameraListEl.appendChild(li);

            updateCameraDetails(camera.id);
        });
    }

    function updateCameraDetails(cameraId) {
        const camera = cameras.find(c => c.id === cameraId);
        const detailsEl = document.getElementById(`details-${camera.id}`);
        if (camera && detailsEl) {
            const mac = camera.mac ? ` / ${camera.mac.toUpperCase()}` : '';
            detailsEl.textContent = `${camera.ip}${mac}`;
        }
    }

    async function pollAllCamerasStatus(fetchFullInfo = false) {
        for (const camera of cameras) {
            const statusIcon = document.getElementById(`status-icon-${camera.id}`);
            const tempEl = document.getElementById(`temp-${camera.id}`);

            if (fetchFullInfo && !camera.mac) {
                const info = await window.api.getCameraInfo(camera);
                if (info.success) {
                    statusIcon?.classList.add('online');
                    camera.mac = info.mac;
                    camera.firmware = info.firmware;
                    updateCameraDetails(camera.id);
                    await saveCamerasToFile();
                } else {
                    statusIcon?.classList.remove('online');
                }
            }
            
            const pulse = await window.api.getCameraPulse(camera);
            if (pulse.success) {
                statusIcon?.classList.add('online');
                if (tempEl) tempEl.textContent = pulse.soc_temp || '';
            } else {
                 statusIcon?.classList.remove('online');
            }
        }
    }

    async function deleteCamera(cameraId) {
        if (confirm('Вы уверены, что хотите удалить эту камеру?')) {
            const cellIndex = gridCellsState.findIndex(s => s && s.camera.id === cameraId);
            if (cellIndex !== -1) await stopStreamInCell(cellIndex, true);
            cameras = cameras.filter(c => c.id !== cameraId);
            await saveCamerasToFile();
            renderCameraList();
        }
    }

    function createGridCells() {
        gridContainer.innerHTML = '';
        for (let i = 0; i < GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.cellId = i;
            cell.innerHTML = `<span>Пусто<br>(Кликните на камеру в списке)</span>`;
            cell.addEventListener('dblclick', () => toggleFullscreen(i));
            gridContainer.appendChild(cell);
        }
    }
    
    async function startStreamInCell(cellIndex, cameraId, streamId) {
        const camera = cameras.find(c => c.id === cameraId);
        if (!camera) return;
        if (gridCellsState[cellIndex]?.player) {
            await stopStreamInCell(cellIndex, false);
        }
        const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
        cellElement.innerHTML = `<span>Подключение (${streamId === 0 ? 'HD' : 'SD'})...</span>`;
        cellElement.classList.add('active');
        const result = await window.api.startVideoStream({ credentials: camera, streamId });
        if (result.success) {
            cellElement.innerHTML = ''; 
            const canvas = document.createElement('canvas');
            cellElement.appendChild(canvas);
            const qualityLabel = streamId === 0 ? 'HD' : 'SD';
            
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'cell-controls';
            controlsDiv.innerHTML = `
                <button class="audio-btn" title="Включить звук">🔇</button>
                <button class="close-btn" title="Закрыть">×</button>
            `;
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'cell-name';
            nameDiv.textContent = `${camera.name} (${qualityLabel})`;

            const statsDiv = document.createElement('div');
            statsDiv.className = 'cell-stats';
            statsDiv.id = `stats-${camera.id}_${streamId}`;
            statsDiv.textContent = 'FPS: ... | ... kb/s';
            
            cellElement.appendChild(controlsDiv);
            cellElement.appendChild(nameDiv);
            cellElement.appendChild(statsDiv);

            const player = new JSMpeg.Player(`ws://localhost:${result.wsPort}`, { 
                canvas, 
                autoplay: true, 
                audio: true,
                volume: 0 
            });

            controlsDiv.querySelector('.close-btn').onclick = (e) => { 
                e.stopPropagation(); 
                stopStreamInCell(cellIndex, true); 
            };
            
            const audioBtn = controlsDiv.querySelector('.audio-btn');
            audioBtn.onclick = (e) => {
                e.stopPropagation();
                if (player.volume === 0) {
                    player.volume = 1;
                    audioBtn.textContent = '🔊';
                    audioBtn.title = 'Выключить звук';
                } else {
                    player.volume = 0;
                    audioBtn.textContent = '🔇';
                    audioBtn.title = 'Включить звук';
                }
            };
            
            gridCellsState[cellIndex] = { camera, player, streamId, uniqueStreamIdentifier: `${camera.id}_${streamId}` };

        } else {
            cellElement.innerHTML = `<span>Ошибка: ${result.error || 'Неизвестная ошибка'}</span>`;
            cellElement.classList.remove('active');
            gridCellsState[cellIndex] = null;
        }
        renderCameraList();
    }

    function addCameraToGrid(cameraId) {
        if (gridCellsState.some(s => s && s.camera.id === cameraId)) return;
        const emptyCellIndex = gridCellsState.findIndex(cell => cell === null);
        if (emptyCellIndex === -1) { alert('Все ячейки заняты!'); return; }
        const camera = cameras.find(c => c.id === cameraId);
        startStreamInCell(emptyCellIndex, cameraId, parseInt(camera.streamId, 10) || 1);
    }
    
    async function stopStreamInCell(cellIndex, clearCellUI = true) {
        const state = gridCellsState[cellIndex];
        if (!state) return;
        if (state.player) state.player.destroy();
        const uniqueIdToStop = `${state.camera.id}_${state.streamId}`;
        await window.api.stopVideoStream(uniqueIdToStop);
        gridCellsState[cellIndex] = null;
        if (clearCellUI) {
            const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
            if(cellElement) {
                cellElement.innerHTML = `<span>Пусто<br>(Кликните на камеру в списке)</span>`;
                cellElement.classList.remove('active');
            }
            renderCameraList();
        }
    }
    
    async function toggleFullscreen(cellIndex) {
        const currentState = gridCellsState[cellIndex];
        if (!currentState) return;
        const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
        const isEnteringFullscreen = !cellElement.classList.contains('fullscreen');
        const newStreamId = isEnteringFullscreen ? 0 : 1;
        const cameraId = currentState.camera.id; 
        
        await stopStreamInCell(cellIndex, true); 
        await new Promise(resolve => setTimeout(resolve, 250)); 
    
        if (isEnteringFullscreen) {
            fullscreenCellIndex = cellIndex;
            cellElement.classList.add('fullscreen');
            gridContainer.classList.add('fullscreen-mode');
        } else {
            fullscreenCellIndex = null;
            cellElement.classList.remove('fullscreen');
            gridContainer.classList.remove('fullscreen-mode');
        }
        await startStreamInCell(cellIndex, cameraId, newStreamId);
    }

    function handleStreamDeath(uniqueStreamIdentifier) {
        const cellIndex = gridCellsState.findIndex(state => state && `${state.camera.id}_${state.streamId}` === uniqueStreamIdentifier);
        if (cellIndex !== -1) {
            console.log(`Поток ${uniqueStreamIdentifier} умер, перезапускаем...`);
            const cameraToRestart = gridCellsState[cellIndex].camera;
            const streamIdToRestart = gridCellsState[cellIndex].streamId;
            if(gridCellsState[cellIndex].player) gridCellsState[cellIndex].player.destroy();
            gridCellsState[cellIndex] = null;
            const cellElement = gridContainer.querySelector(`[data-cell-id='${cellIndex}']`);
            if (cellElement) {
                cellElement.innerHTML = `<span>Потеря связи.<br>Переподключение...</span>`;
            }
            setTimeout(() => startStreamInCell(cellIndex, cameraToRestart.id, streamIdToRestart), 5000);
        }
        renderCameraList();
    }
    
    function openAddModal(cameraToEdit = null) {
        editingCameraId = cameraToEdit ? cameraToEdit.id : null;
        const modalTitle = document.getElementById('add-modal-title');
        const camera = cameraToEdit || {};
        modalTitle.textContent = cameraToEdit ? 'Редактировать камеру' : 'Добавить новую камеру';
        document.getElementById('new-cam-name').value = camera.name || camera.hostname || '';
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

        const info = await window.api.getCameraInfo(cameraData);
        if(info.mac) {
            cameraData.mac = info.mac;
        }

        if (editingCameraId) {
            const index = cameras.findIndex(c => c.id === editingCameraId);
            cameras[index] = { ...cameras[index], ...cameraData };
        } else {
            cameras.push({ id: Date.now(), ...cameraData });
        }
        await saveCamerasToFile();
        closeModal(addModal);
        renderCameraList();
    }
    
    saveCameraBtn.addEventListener('click', saveCameraBtnClick);
    
    addCameraBtn.addEventListener('click', () => {
        openAddModal();
    });

    killAllBtn.addEventListener('click', async () => {
        if (confirm('Это принудительно завершит все процессы ffmpeg. Используйте, если потоки зависли. Продолжить?')) {
            const result = await window.api.killAllFfmpeg();
            alert(result.message);
            window.location.reload();
        }
    });

    addModalCloseBtn.addEventListener('click', () => closeModal(addModal));
    cancelAddBtn.addEventListener('click', () => closeModal(addModal));
    addModal.addEventListener('click', (e) => { if (e.target === addModal) closeModal(addModal); });
    
    cameraListEl.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        const id = parseInt(li.dataset.id, 10);
        
        if (e.target.closest('.item-controls')) {
            e.stopPropagation();
            window.api.showCameraContextMenu(id);
        } 
        else if(e.target.closest('.camera-info') || e.target.closest('.status-icon')) {
             addCameraToGrid(id);
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
    
    settingsModalCloseBtn.addEventListener('click', () => closeModal(settingsModal));
    saveSettingsBtn.addEventListener('click', saveSettings);
    restartMajesticBtn.addEventListener('click', restartMajestic);
    
    settingsModal.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            settingsModal.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            settingsModal.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.dataset.tab)?.classList.add('active');
        });
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(addModal);
            closeModal(settingsModal);
            if (fullscreenCellIndex !== null) toggleFullscreen(fullscreenCellIndex);
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

    createGridCells();
    loadCamerasFromFile();
    setInterval(() => pollAllCamerasStatus(false), 60000);
    window.api.onStreamDied((uniqueStreamIdentifier) => handleStreamDeath(uniqueStreamIdentifier));
});