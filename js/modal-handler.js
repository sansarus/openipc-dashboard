// js/modal-handler.js

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createModalHandler = function(App) {
        // --- UI Elements ---
        const addModal = document.getElementById('add-camera-modal');
        const saveCameraBtn = document.getElementById('save-camera-btn');
        const cancelAddBtn = document.getElementById('cancel-camera-btn');
        const addModalCloseBtn = document.getElementById('add-modal-close-btn');
        const addGroupModal = document.getElementById('add-group-modal');
        const newGroupNameInput = document.getElementById('new-group-name');
        const saveGroupBtn = document.getElementById('save-group-btn');
        const cancelGroupBtn = document.getElementById('cancel-group-btn');
        const addGroupModalCloseBtn = document.getElementById('add-group-modal-close-btn');
        const settingsModal = document.getElementById('settings-modal');
        const settingsModalCloseBtn = document.getElementById('settings-modal-close-btn');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const restartMajesticBtn = document.getElementById('restart-majestic-btn');
        const killAllBtnModal = document.getElementById('kill-all-btn-modal');
        const settingsToast = document.getElementById('settings-toast');
        const recordingsPathInput = document.getElementById('app-settings-recordings-path');
        const selectRecPathBtn = document.getElementById('select-rec-path-btn');
        let toastTimeout;

        let editingCameraId = null;
        let settingsCameraId = null;
        let initialSettings = null;

        function setupRangeSync(rangeId) {
            const rangeInput = document.getElementById(rangeId);
            const valueSpan = document.getElementById(`${rangeId}-value`);
            if (!rangeInput || !valueSpan) {
                return () => {};
            }
        
            const updateValue = () => {
                valueSpan.textContent = rangeInput.value;
            };
        
            rangeInput.addEventListener('input', updateValue);
            
            return (value) => {
                if (value !== undefined) {
                    rangeInput.value = value;
                    updateValue();
                }
            };
        }

        const openModal = (modalElement) => modalElement.classList.remove('hidden');
        const closeModal = (modalElement) => modalElement.classList.add('hidden');

        function showToast(message, isError = false, duration = 3000) {
            if (toastTimeout) clearTimeout(toastTimeout);
            settingsToast.textContent = message;
            settingsToast.className = 'toast-notification';
            if (isError) settingsToast.classList.add('error');
            settingsToast.classList.add('show');
            toastTimeout = setTimeout(() => {
                settingsToast.classList.remove('show');
            }, duration);
        }
        
        function getNestedValue(obj, path) {
            if (!path || !obj) return undefined;
            return path.split('.').reduce((acc, part) => acc && acc[part], obj);
        }

        function setFormValue(id, value) {
            const element = document.getElementById(id);
            if (!element || value === undefined) return;
            if (element.type === 'checkbox') {
                element.checked = value === true || value === 'true';
            } else {
                element.value = value;
            }
        }

        function openAddModal(cameraToEdit = null) {
            editingCameraId = cameraToEdit && cameraToEdit.id ? cameraToEdit.id : null;
            const modalTitle = document.getElementById('add-modal-title');
            const camera = cameraToEdit || {};
            modalTitle.textContent = editingCameraId ? 'Редактировать камеру' : 'Добавить новую камеру';
            document.getElementById('new-cam-name').value = camera.name || '';
            document.getElementById('new-cam-ip').value = camera.ip || '';
            document.getElementById('new-cam-port').value = camera.port || '554';
            document.getElementById('new-cam-user').value = camera.username || 'root';
            document.getElementById('new-cam-pass').value = camera.password || '';
            document.getElementById('new-cam-stream-path0').value = camera.streamPath0 !== undefined ? camera.streamPath0 : '/stream0';
            document.getElementById('new-cam-stream-path1').value = camera.streamPath1 !== undefined ? camera.streamPath1 : '/stream1';
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
                streamPath0: document.getElementById('new-cam-stream-path0').value.trim(),
                streamPath1: document.getElementById('new-cam-stream-path1').value.trim()
            };

            if (!cameraData.name || !cameraData.ip) {
                alert('Название и IP-адрес обязательны!');
                return;
            }

            if (editingCameraId) {
                const index = App.cameras.findIndex(c => c.id === editingCameraId);
                const oldCam = { ...App.cameras[index] }; 
                
                Object.assign(App.cameras[index], cameraData);

                const needsRestart = oldCam.ip !== cameraData.ip ||
                                     oldCam.port !== cameraData.port ||
                                     oldCam.username !== cameraData.username ||
                                     oldCam.password !== cameraData.password ||
                                     oldCam.streamPath0 !== cameraData.streamPath0 ||
                                     oldCam.streamPath1 !== cameraData.streamPath1;

                if (needsRestart) {
                    console.log('Critical camera settings changed. Restarting streams.');
                    App.gridManager.restartStreamsForCamera(editingCameraId);
                } else if (oldCam.name !== cameraData.name) {
                    console.log('Only camera name changed. Updating UI.');
                    App.gridManager.updateCameraNameInGrid(editingCameraId, cameraData.name);
                }
            } else {
                App.cameras.push({ id: Date.now(), groupId: null, ...cameraData });
            }

            await App.saveConfiguration();
            closeModal(addModal);
            App.cameraList.render();
        }

        async function openSettingsModal(cameraId = null) {
            settingsCameraId = cameraId;
            const isGeneralSettings = !cameraId;
            const camera = isGeneralSettings ? null : App.cameras.find(c => c.id === cameraId);
        
            if (!isGeneralSettings && !camera) return;
        
            document.getElementById('settings-modal-title').textContent = isGeneralSettings ? 'Общие настройки' : `Настройки: ${camera.name}`;
            
            const tabsContainer = settingsModal.querySelector('.tabs');
            const allTabs = tabsContainer.querySelectorAll('.tab-button');
            const allContent = settingsModal.querySelectorAll('.tab-content');
        
            allTabs.forEach(btn => {
                const isGeneralTab = btn.dataset.tab === 'tab-general';
                btn.style.display = isGeneralSettings ? (isGeneralTab ? 'flex' : 'none') : (isGeneralTab ? 'none' : 'flex');
            });
            
            allContent.forEach(el => el.classList.remove('active'));
            allTabs.forEach(el => el.classList.remove('active'));
        
            if (isGeneralSettings) {
                tabsContainer.querySelector('[data-tab="tab-general"]').classList.add('active');
                document.getElementById('tab-general').classList.add('active');
            } else {
                tabsContainer.querySelector('[data-tab="tab-system"]').classList.add('active');
                document.getElementById('tab-system').classList.add('active');
            }
        
            recordingsPathInput.value = App.appSettings.recordingsPath || '';
            restartMajesticBtn.style.display = isGeneralSettings ? 'none' : 'inline-flex';
            
            openModal(settingsModal);
            
            if (isGeneralSettings) {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = 'Сохранить';
                return;
            }
            
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = 'Загрузка...';
        
            try {
                const settings = await window.api.getCameraSettings(camera);
        
                if (settings && !settings.error) {
                    if (settings.motionDetect) {
                        setFormValue('motionDetect.enabled', settings.motionDetect.enabled);
                        setFormValue('motionDetect.visualize', settings.motionDetect.visualize);
                        setFormValue('motionDetect.debug', settings.motionDetect.debug);
                        setFormValue('motionDetect.roi', settings.motionDetect.roi);
                    }
                    
                    if (settings.records) {
                        setFormValue('records.enabled', settings.records.enabled);
                        setFormValue('records.path', settings.records.path);
                        setFormValue('records.split', settings.records.split);
                        setFormValue('records.substream', settings.records.substream);
                        setupRangeSync('records.maxUsage')(settings.records.maxUsage);
                    }
                    
                    if (settings.outgoing) {
                        setFormValue('outgoing.enabled', settings.outgoing.enabled);
                        setFormValue('outgoing.server', settings.outgoing.server);
                        setFormValue('outgoing.naluSize', settings.outgoing.naluSize);
                        setFormValue('outgoing.substream', settings.outgoing.substream);
                    }
                    
                    if (settings.watchdog) {
                        setFormValue('watchdog.enabled', settings.watchdog.enabled);
                        setFormValue('watchdog.timeout', settings.watchdog.timeout);
                    }
                    
                    if (settings.hls) {
                        setFormValue('hls.enabled', settings.hls.enabled);
                    }
                    
                    if (settings.onvif) {
                        setFormValue('onvif.enabled', settings.onvif.enabled);
                    }
                    
                    if (settings.ipeye) {
                        setFormValue('ipeye.enabled', settings.ipeye.enabled);
                    }

                    // START: MODIFIED SECTION
                    if (settings.netip) {
                        setFormValue('netip.enabled', settings.netip.enabled);
                        setFormValue('netip.user', settings.netip.user);
                        setFormValue('netip.password', settings.netip.password);
                        setFormValue('netip.port', settings.netip.port);
                        setFormValue('netip.snapshots', settings.netip.snapshots);
                        setFormValue('netip.ignoreSetTime', settings.netip.ignoreSetTime);
                    }
                    // END: MODIFIED SECTION
                    
                    if (settings.system) {
                        setFormValue('system.webPort', settings.system.webPort);
                        setFormValue('system.httpsPort', settings.system.httpsPort);
                        setFormValue('system.httpsCertificate', settings.system.httpsCertificate);
                        setFormValue('system.httpsCertificateKey', settings.system.httpsCertificateKey);
                        setFormValue('system.logLevel', settings.system.logLevel);
                        setFormValue('system.unsafe', settings.system.unsafe);
                        setFormValue('system.buffer', settings.system.buffer);
                        setFormValue('system.plugins', settings.system.plugins);
                    }

                    if (settings.isp) {
                        setFormValue('isp.drc', settings.isp.drc);
                        setFormValue('isp.sensorConfig', settings.isp.sensorConfig);
                        setFormValue('isp.antiFlicker', settings.isp.antiFlicker);
                        setFormValue('isp.iqProfile', settings.isp.iqProfile);
                        setFormValue('isp.blkCnt', settings.isp.blkCnt);
                        setFormValue('isp.slowShutter', settings.isp.slowShutter);
                        setFormValue('isp.rawMode', settings.isp.rawMode);
                        setFormValue('isp.dis', settings.isp.dis);
                        setFormValue('isp.memMode', settings.isp.memMode);
                    }

                    if (settings.image) {
                        setFormValue('image.mirror', settings.image.mirror);
                        setFormValue('image.flip', settings.image.flip);
                        setFormValue('image.rotate', settings.image.rotate);
                        setFormValue('image.tuning', settings.image.tuning);
                        setupRangeSync('image.contrast')(settings.image.contrast);
                        setupRangeSync('image.hue')(settings.image.hue);
                        setupRangeSync('image.saturation')(settings.image.saturation);
                        setupRangeSync('image.luminance')(settings.image.luminance);
                    }
                    
                    if (settings.video0) {
                        setFormValue('video0.enabled', settings.video0.enabled);
                        setFormValue('video0.codec', settings.video0.codec);
                        setFormValue('video0.size', settings.video0.size);
                        setFormValue('video0.fps', settings.video0.fps);
                        setFormValue('video0.bitrate', settings.video0.bitrate);
                        setFormValue('video0.rcMode', settings.video0.rcMode);
                        setFormValue('video0.profile', settings.video0.profile);
                        setFormValue('video0.gopSize', settings.video0.gopSize);
                        setFormValue('video0.crop', settings.video0.crop);
                        setFormValue('video0.gopMode', settings.video0.gopMode);
                    }

                    if (settings.video1) {
                        setFormValue('video1.enabled', settings.video1.enabled);
                        setFormValue('video1.codec', settings.video1.codec);
                        setFormValue('video1.size', settings.video1.size);
                        setFormValue('video1.fps', settings.video1.fps);
                        setFormValue('video1.bitrate', settings.video1.bitrate);
                        setFormValue('video1.rcMode', settings.video1.rcMode);
                        setFormValue('video1.profile', settings.video1.profile);
                        setFormValue('video1.gopSize', settings.video1.gopSize);
                        setFormValue('video1.crop', settings.video1.crop);
                        setFormValue('video1.gopMode', settings.video1.gopMode);
                    }

                    if (settings.jpeg) {
                        setFormValue('jpeg.enabled', settings.jpeg.enabled);
                        setFormValue('jpeg.size', settings.jpeg.size);
                        setFormValue('jpeg.rtsp', settings.jpeg.rtsp);
                        setupRangeSync('jpeg.qfactor')(settings.jpeg.qfactor);
                        setupRangeSync('jpeg.fps')(settings.jpeg.fps);
                    }

                    if (settings.osd) {
                        setFormValue('osd.enabled', settings.osd.enabled);
                        setFormValue('osd.font', settings.osd.font);
                        setFormValue('osd.template', settings.osd.template);
                        setFormValue('osd.size', settings.osd.size);
                        setFormValue('osd.posX', settings.osd.posX);
                        setFormValue('osd.posY', settings.osd.posY);
                        setFormValue('osd.privacyMasks', settings.osd.privacyMasks);
                    }
                    
                    if (settings.audio) {
                        setFormValue('audio.enabled', settings.audio.enabled);
                        setFormValue('audio.srate', settings.audio.srate);
                        setFormValue('audio.codec', settings.audio.codec);
                        setFormValue('audio.outputEnabled', settings.audio.outputEnabled);
                        setFormValue('audio.speakerPin', settings.audio.speakerPin);
                        setFormValue('audio.speakerPinInvert', settings.audio.speakerPinInvert);
                        setFormValue('audio.dual', settings.audio.dual);
                        setupRangeSync('audio.volume')(settings.audio.volume);
                        setupRangeSync('audio.outputVolume')(settings.audio.outputVolume);
                    }
                    
                    if (settings.rtsp) {
                        setFormValue('rtsp.enabled', settings.rtsp.enabled);
                        setFormValue('rtsp.port', settings.rtsp.port);
                    }

                    if (settings.nightMode) {
                        setFormValue('nightMode.colorToGray', settings.nightMode.colorToGray);
                        setFormValue('nightMode.irCutPin1', settings.nightMode.irCutPin1);
                        setFormValue('nightMode.irCutSingleInvert', settings.nightMode.irCutSingleInvert);
                        setFormValue('nightMode.irCutPin2', settings.nightMode.irCutPin2);
                        setFormValue('nightMode.backlightPin', settings.nightMode.backlightPin);
                        setFormValue('nightMode.overrideDrc', settings.nightMode.overrideDrc);
                        setFormValue('nightMode.lightMonitor', settings.nightMode.lightMonitor);
                        setFormValue('nightMode.lightSensorPin', settings.nightMode.lightSensorPin);
                        setFormValue('nightMode.lightSensorInvert', settings.nightMode.lightSensorInvert);
                        setFormValue('nightMode.minThreshold', settings.nightMode.minThreshold);
                        setFormValue('nightMode.maxThreshold', settings.nightMode.maxThreshold);
                        setupRangeSync('nightMode.monitorDelay')(settings.nightMode.monitorDelay);
                    }
                    
                    console.log('Настройки камеры загружены:', settings);
                    initialSettings = settings;
                } else {
                    throw new Error(settings?.error || 'Неизвестная ошибка');
                }
            } catch (e) {
                alert('Не удалось загрузить текущие настройки: ' + e.message);
                closeModal(settingsModal);
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = 'Сохранить';
            }
        }

        async function saveSettings() {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = 'Сохранение...';
        
            App.appSettings.recordingsPath = recordingsPathInput.value.trim();
            await window.api.saveAppSettings(App.appSettings);
        
            if (settingsCameraId === null) { 
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = 'Сохранить';
                showToast('Общие настройки сохранены!');
                return;
            }
        
            const camera = App.cameras.find(c => c.id === settingsCameraId);
            if (!camera) {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = 'Сохранить';
                return;
            }
            
            const getFormValue = (id) => {
                const el = document.getElementById(id);
                if (!el) return undefined;
                return el.type === 'checkbox' ? el.checked : el.value;
            };

            const settingsDataToSend = {
                'motionDetect.enabled': getFormValue('motionDetect.enabled'),
                'motionDetect.visualize': getFormValue('motionDetect.visualize'),
                'motionDetect.debug': getFormValue('motionDetect.debug'),
                'motionDetect.roi': getFormValue('motionDetect.roi'),

                'records.enabled': getFormValue('records.enabled'),
                'records.path': getFormValue('records.path'),
                'records.split': getFormValue('records.split'),
                'records.maxUsage': getFormValue('records.maxUsage'),
                'records.substream': getFormValue('records.substream'),
                
                'outgoing.enabled': getFormValue('outgoing.enabled'),
                'outgoing.server': getFormValue('outgoing.server'),
                'outgoing.naluSize': getFormValue('outgoing.naluSize'),
                'outgoing.substream': getFormValue('outgoing.substream'),
                
                'watchdog.enabled': getFormValue('watchdog.enabled'),
                'watchdog.timeout': getFormValue('watchdog.timeout'),
                
                'hls.enabled': getFormValue('hls.enabled'),
                
                'onvif.enabled': getFormValue('onvif.enabled'),
                
                'ipeye.enabled': getFormValue('ipeye.enabled'),
                
                // START: MODIFIED SECTION
                'netip.enabled': getFormValue('netip.enabled'),
                'netip.user': getFormValue('netip.user'),
                'netip.password': getFormValue('netip.password'),
                'netip.port': getFormValue('netip.port'),
                'netip.snapshots': getFormValue('netip.snapshots'),
                'netip.ignoreSetTime': getFormValue('netip.ignoreSetTime'),
                // END: MODIFIED SECTION

                'system.webPort': getFormValue('system.webPort'),
                'system.httpsPort': getFormValue('system.httpsPort'),
                'system.httpsCertificate': getFormValue('system.httpsCertificate'),
                'system.httpsCertificateKey': getFormValue('system.httpsCertificateKey'),
                'system.logLevel': getFormValue('system.logLevel'),
                'system.unsafe': getFormValue('system.unsafe'),
                'system.buffer': getFormValue('system.buffer'),
                'system.plugins': getFormValue('system.plugins'),
                'isp.drc': getFormValue('isp.drc'),
                'isp.sensorConfig': getFormValue('isp.sensorConfig'),
                'isp.antiFlicker': getFormValue('isp.antiFlicker'),
                'isp.iqProfile': getFormValue('isp.iqProfile'),
                'isp.blkCnt': getFormValue('isp.blkCnt'),
                'isp.slowShutter': getFormValue('isp.slowShutter'),
                'isp.rawMode': getFormValue('isp.rawMode'),
                'isp.dis': getFormValue('isp.dis'),
                'isp.memMode': getFormValue('isp.memMode'),
                'image.mirror': getFormValue('image.mirror'),
                'image.flip': getFormValue('image.flip'),
                'image.contrast': getFormValue('image.contrast'),
                'image.hue': getFormValue('image.hue'),
                'image.saturation': getFormValue('image.saturation'),
                'image.luminance': getFormValue('image.luminance'),
                'image.rotate': getFormValue('image.rotate'),
                'image.tuning': getFormValue('image.tuning'),
                'video0.enabled': getFormValue('video0.enabled'),
                'video0.codec': getFormValue('video0.codec'),
                'video0.size': getFormValue('video0.size'),
                'video0.fps': getFormValue('video0.fps'),
                'video0.bitrate': getFormValue('video0.bitrate'),
                'video0.rcMode': getFormValue('video0.rcMode'),
                'video0.profile': getFormValue('video0.profile'),
                'video0.gopSize': getFormValue('video0.gopSize'),
                'video0.crop': getFormValue('video0.crop'),
                'video0.gopMode': getFormValue('video0.gopMode'),
                'video1.enabled': getFormValue('video1.enabled'),
                'video1.codec': getFormValue('video1.codec'),
                'video1.size': getFormValue('video1.size'),
                'video1.fps': getFormValue('video1.fps'),
                'video1.bitrate': getFormValue('video1.bitrate'),
                'video1.rcMode': getFormValue('video1.rcMode'),
                'video1.profile': getFormValue('video1.profile'),
                'video1.gopSize': getFormValue('video1.gopSize'),
                'video1.crop': getFormValue('video1.crop'),
                'video1.gopMode': getFormValue('video1.gopMode'),
                'jpeg.enabled': getFormValue('jpeg.enabled'),
                'jpeg.size': getFormValue('jpeg.size'),
                'jpeg.qfactor': getFormValue('jpeg.qfactor'),
                'jpeg.fps': getFormValue('jpeg.fps'),
                'jpeg.rtsp': getFormValue('jpeg.rtsp'),
                'osd.enabled': getFormValue('osd.enabled'),
                'osd.font': getFormValue('osd.font'),
                'osd.template': getFormValue('osd.template'),
                'osd.size': getFormValue('osd.size'),
                'osd.posX': getFormValue('osd.posX'),
                'osd.posY': getFormValue('osd.posY'),
                'osd.privacyMasks': getFormValue('osd.privacyMasks'),
                'audio.enabled': getFormValue('audio.enabled'),
                'audio.volume': getFormValue('audio.volume'),
                'audio.srate': getFormValue('audio.srate'),
                'audio.codec': getFormValue('audio.codec'),
                'audio.outputEnabled': getFormValue('audio.outputEnabled'),
                'audio.outputVolume': getFormValue('audio.outputVolume'),
                'audio.speakerPin': getFormValue('audio.speakerPin'),
                'audio.speakerPinInvert': getFormValue('audio.speakerPinInvert'),
                'audio.dual': getFormValue('audio.dual'),
                'rtsp.enabled': getFormValue('rtsp.enabled'),
                'rtsp.port': getFormValue('rtsp.port'),
                'nightMode.colorToGray': getFormValue('nightMode.colorToGray'),
                'nightMode.irCutPin1': getFormValue('nightMode.irCutPin1'),
                'nightMode.irCutSingleInvert': getFormValue('nightMode.irCutSingleInvert'),
                'nightMode.irCutPin2': getFormValue('nightMode.irCutPin2'),
                'nightMode.backlightPin': getFormValue('nightMode.backlightPin'),
                'nightMode.overrideDrc': getFormValue('nightMode.overrideDrc'),
                'nightMode.lightMonitor': getFormValue('nightMode.lightMonitor'),
                'nightMode.lightSensorPin': getFormValue('nightMode.lightSensorPin'),
                'nightMode.lightSensorInvert': getFormValue('nightMode.lightSensorInvert'),
                'nightMode.monitorDelay': getFormValue('nightMode.monitorDelay'),
                'nightMode.minThreshold': getFormValue('nightMode.minThreshold'),
                'nightMode.maxThreshold': getFormValue('nightMode.maxThreshold'),
            };
            
            if (Object.keys(settingsDataToSend).length > 0) {
                const result = await window.api.setCameraSettings({ credentials: camera, settingsData: settingsDataToSend });
                if (result.success) {
                    showToast('Настройки камеры успешно сохранены!');
                } else {
                    showToast(`Ошибка сохранения настроек камеры: ${result.error}`, true);
                }
            } else {
                showToast('Настройки сохранены в приложении.', false);
            }
        
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = 'Сохранить';
        }

        async function restartMajestic() {
            if (settingsCameraId === null) return;
            const camera = App.cameras.find(c => c.id === settingsCameraId);
            if (!camera) return;
            restartMajesticBtn.disabled = true;
            const result = await window.api.restartMajestic(camera);
            restartMajesticBtn.disabled = false;
            showToast(result.success ? 'Команда на перезапуск отправлена.' : `Ошибка: ${result.error}`, !result.success);
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
            App.groups.push(newGroup);
            App.saveConfiguration();
            App.cameraList.render();
            closeModal(addGroupModal);
        }
        
        function init() {
            const addCameraSidebarBtn = document.getElementById('add-camera-sidebar-btn');
            const addGroupBtn = document.getElementById('add-group-btn');
            const generalSettingsBtn = document.getElementById('general-settings-btn');

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
            
            generalSettingsBtn.addEventListener('click', () => openSettingsModal(null));

            selectRecPathBtn.addEventListener('click', async () => {
                const result = await window.api.selectDirectory();
                if (!result.canceled) {
                    recordingsPathInput.value = result.path;
                }
            });

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
                }
            });
        }

        return {
            init,
            openAddModal,
            openSettingsModal
        };
    };
})(window);