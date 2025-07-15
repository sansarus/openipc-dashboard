// js/modal-handler.js (ИСПРАВЛЕННАЯ ВЕРСИЯ)

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
        const languageSelect = document.getElementById('app-settings-language');
        const hwAccelSelect = document.getElementById('app-settings-hw-accel');
        
        const checkForUpdatesBtn = document.getElementById('check-for-updates-btn');
        const updateStatusText = document.getElementById('update-status-text');
        
        let toastTimeout;
        let editingCameraId = null;
        let settingsCameraId = null;
        let rangeSyncFunctions = {};

        // --- Helper Functions ---
        const openModal = (modalElement) => modalElement.classList.remove('hidden');
        const closeModal = (modalElement) => modalElement.classList.add('hidden');
        function showToast(message, isError = false, duration = 3000) { if (toastTimeout) clearTimeout(toastTimeout); settingsToast.textContent = message; settingsToast.className = 'toast-notification'; if (isError) settingsToast.classList.add('error'); settingsToast.classList.add('show'); toastTimeout = setTimeout(() => { settingsToast.classList.remove('show'); }, duration); }

        function setupRangeSync(rangeId) {
            const rangeInput = document.getElementById(rangeId);
            const valueSpan = document.getElementById(`${rangeId}-value`);
            if (!rangeInput || !valueSpan) { return () => {}; }
            
            const updateValue = () => { valueSpan.textContent = rangeInput.value; };
            rangeInput.addEventListener('input', updateValue);
            
            const syncFunc = (value) => {
                if (value !== undefined) {
                    rangeInput.value = value;
                    updateValue();
                }
            };
            rangeSyncFunctions[rangeId] = syncFunc;
            return syncFunc;
        }

        function setFormValue(id, value) {
            if (value === undefined || value === null) return;
            const el = document.getElementById(id);
            if (!el) return;

            if (el.type === 'checkbox') {
                el.checked = !!value;
            } else if (el.type === 'range') {
                const syncFunc = rangeSyncFunctions[id];
                if (syncFunc) {
                    syncFunc(value);
                } else {
                    el.value = value;
                }
            } else {
                el.value = value;
            }
        }

        // --- Modal Opening Functions ---
        function openAddModal(cameraToEdit = null) {
            editingCameraId = cameraToEdit && cameraToEdit.id ? cameraToEdit.id : null;
            const modalTitle = document.getElementById('add-modal-title');
            const camera = cameraToEdit || {};
            
            modalTitle.textContent = editingCameraId ? App.t('edit_camera_title') : App.t('add_camera_title');
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
        
        function openAddGroupModal() {
            newGroupNameInput.value = '';
            openModal(addGroupModal);
            newGroupNameInput.focus();
        }

        async function openSettingsModal(cameraId = null) {
            settingsCameraId = cameraId;
            rangeSyncFunctions = {}; // Очищаем старые функции
            const isGeneralSettings = !cameraId;
            const camera = isGeneralSettings ? null : App.cameras.find(c => c.id === cameraId);
            if (!isGeneralSettings && !camera) return;

            document.getElementById('settings-modal-title').textContent = isGeneralSettings ? App.t('general_settings_title') : `${App.t('camera_settings_title_prefix')}: ${camera.name}`;
            
            const tabsContainer = settingsModal.querySelector('.tabs');
            const allTabs = tabsContainer.querySelectorAll('.tab-button');
            const allContent = settingsModal.querySelectorAll('.tab-content');
            allTabs.forEach(btn => { const isGeneralTab = btn.dataset.tab === 'tab-general'; btn.style.display = isGeneralSettings ? (isGeneralTab ? 'flex' : 'none') : (isGeneralTab ? 'none' : 'flex'); });
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
            languageSelect.value = App.appSettings.language || 'en';
            hwAccelSelect.value = App.appSettings.hwAccel || 'auto';
            restartMajesticBtn.style.display = isGeneralSettings ? 'none' : 'inline-flex';
            
            openModal(settingsModal);
            
            if (isGeneralSettings) {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = App.t('save');
                return;
            }
            
            // Инициализация всех слайдеров
            ['image.contrast', 'image.hue', 'image.saturation', 'image.luminance', 
             'jpeg.qfactor', 'jpeg.fps', 'audio.volume', 'audio.outputVolume',
             'nightMode.monitorDelay', 'records.maxUsage'].forEach(setupRangeSync);
            
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = App.t('loading_text');
            try {
                const settings = await window.api.getCameraSettings(camera);
                if (settings && !settings.error) {
                    // Цикл для установки всех значений
                    for (const section in settings) {
                        if (typeof settings[section] === 'object' && settings[section] !== null) {
                            for (const key in settings[section]) {
                                const id = `${section}.${key}`;
                                const value = settings[section][key];
                                setFormValue(id, value);
                            }
                        }
                    }
                } else {
                    throw new Error(settings?.error || App.t('unknown_error'));
                }
            } catch (e) {
                alert(`${App.t('loading_settings_error')}: ${e.message}`);
                closeModal(settingsModal);
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = App.t('save');
            }
        }
        
        // --- Save/Action Functions ---
        async function saveCameraBtnClick() { const cameraData = { name: document.getElementById('new-cam-name').value.trim(), ip: document.getElementById('new-cam-ip').value.trim(), port: document.getElementById('new-cam-port').value.trim(), username: document.getElementById('new-cam-user').value.trim(), password: document.getElementById('new-cam-pass').value, streamPath0: document.getElementById('new-cam-stream-path0').value.trim(), streamPath1: document.getElementById('new-cam-stream-path1').value.trim() }; if (!cameraData.name || !cameraData.ip) { alert(App.t('name_and_ip_required')); return; } if (editingCameraId) { const index = App.cameras.findIndex(c => c.id === editingCameraId); const oldCam = { ...App.cameras[index] }; Object.assign(App.cameras[index], cameraData); const needsRestart = oldCam.ip !== cameraData.ip || oldCam.port !== cameraData.port || oldCam.username !== cameraData.username || oldCam.password !== cameraData.password || oldCam.streamPath0 !== cameraData.streamPath0 || oldCam.streamPath1 !== cameraData.streamPath1; if (needsRestart) { console.log('Critical camera settings changed. Restarting streams.'); App.gridManager.restartStreamsForCamera(editingCameraId); } else if (oldCam.name !== cameraData.name) { console.log('Only camera name changed. Updating UI.'); App.gridManager.updateCameraNameInGrid(editingCameraId, cameraData.name); App.cameraList.render(); } } else { App.cameras.push({ id: Date.now(), groupId: null, ...cameraData }); } await App.saveConfiguration(); closeModal(addModal); App.cameraList.render(); }
        async function saveNewGroup() { const name = newGroupNameInput.value.trim(); if (!name) { alert(App.t('group_name_empty_error')); return; } const newGroup = { id: Date.now(), name: name }; App.groups.push(newGroup); await App.saveConfiguration(); closeModal(addGroupModal); App.cameraList.render(); }
        
        async function saveSettings() {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = App.t('saving_text');
        
            // Сохранение общих настроек приложения
            if (settingsCameraId === null) {
                App.appSettings.recordingsPath = recordingsPathInput.value.trim();
                App.appSettings.hwAccel = hwAccelSelect.value;
                App.appSettings.language = languageSelect.value;
                await window.api.saveAppSettings(App.appSettings);
                showToast(App.t('app_settings_saved_success'));
            } 
            // Сохранение настроек камеры
            else {
                const camera = App.cameras.find(c => c.id === settingsCameraId);
                if (!camera) {
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.textContent = App.t('save');
                    return;
                }
        
                const settingsDataToSend = {};
                const allSettingElements = settingsModal.querySelectorAll('[id*="."]');

                allSettingElements.forEach(el => {
                    const id = el.id;
                    if (!id) return;
                    // Пропускаем общие настройки
                    if (id.startsWith('app-settings-')) return;
                    
                    const parts = id.split('.');
                    if (parts.length !== 2) return;
                    const [section, key] = parts;

                    if (!settingsDataToSend[section]) {
                        settingsDataToSend[section] = {};
                    }

                    if (el.type === 'checkbox') {
                        settingsDataToSend[section][key] = el.checked;
                    } else if (el.value !== '' && el.value !== null) {
                        if (el.type === 'number' || el.type === 'range') {
                            settingsDataToSend[section][key] = Number(el.value);
                        } else {
                            settingsDataToSend[section][key] = el.value;
                        }
                    }
                });
        
                if (Object.keys(settingsDataToSend).length > 0) {
                    const result = await window.api.setCameraSettings({ credentials: camera, settingsData: settingsDataToSend });
                    if (result.success) {
                        showToast(App.t('camera_settings_saved_success'));
                    } else {
                        showToast(`${App.t('save_settings_error')}: ${result.error}`, true, 5000);
                    }
                } else {
                    showToast(App.t('app_settings_saved_success'), false);
                }
            }
        
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = App.t('save');
        }

        async function restartMajestic() { if (!settingsCameraId) return; const camera = App.cameras.find(c => c.id === settingsCameraId); if (!camera) return; const result = await window.api.restartMajestic(camera); if (result.success) { showToast(App.t('restart_command_sent')); } else { showToast(`${App.t('restart_error')}: ${result.error}`, true); } }
        
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
            settingsModalCloseBtn.addEventListener('click', () => closeModal(settingsModal));
            restartMajesticBtn.addEventListener('click', restartMajestic);
            killAllBtnModal.addEventListener('click', async () => { if (confirm(App.t('kill_all_confirm'))) { const result = await window.api.killAllFfmpeg(); alert(result.message); window.location.reload(); } });
            
            saveSettingsBtn.addEventListener('click', saveSettings);

            languageSelect.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                App.appSettings.language = newLang;
                await window.api.saveAppSettings(App.appSettings);
                await App.i18n.setLanguage(newLang);
                if (!addModal.classList.contains('hidden')) { openAddModal(editingCameraId ? App.cameras.find(c => c.id === editingCameraId) : null); }
                if (!settingsModal.classList.contains('hidden')) { openSettingsModal(settingsCameraId); }
                if (!addGroupModal.classList.contains('hidden')) { document.getElementById('add-group-modal-title').textContent = App.t('create_group_title'); }
                showToast(App.t('app_settings_saved_success'));
            });

            selectRecPathBtn.addEventListener('click', async () => { const result = await window.api.selectDirectory(); if (!result.canceled) { recordingsPathInput.value = result.path; } });
            settingsModal.querySelectorAll('.tab-button').forEach(button => { button.addEventListener('click', () => { settingsModal.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active')); button.classList.add('active'); const tabContent = document.getElementById(button.dataset.tab); if (tabContent) tabContent.classList.add('active'); }); });
            
            checkForUpdatesBtn.addEventListener('click', () => { updateStatusText.textContent = App.t('update_checking'); checkForUpdatesBtn.disabled = true; window.api.checkForUpdates(); });
            window.api.onUpdateStatus(({ status, message }) => { checkForUpdatesBtn.disabled = false; let version = message.includes(' ') ? message.split(' ').pop() : ''; switch (status) { case 'available': updateStatusText.textContent = App.t('update_available', { version }); updateStatusText.style.color = '#ffc107'; break; case 'downloading': updateStatusText.textContent = App.t('update_downloading', { percent: message.match(/\d+/)[0] }); updateStatusText.style.color = '#17a2b8'; checkForUpdatesBtn.disabled = true; break; case 'downloaded': updateStatusText.textContent = App.t('update_downloaded'); updateStatusText.style.color = '#28a745'; break; case 'error': updateStatusText.textContent = App.t('update_error', { message }); updateStatusText.style.color = '#dc3545'; break; case 'latest': updateStatusText.textContent = App.t('update_latest'); updateStatusText.style.color = 'green'; break; default: updateStatusText.textContent = App.t('update_check_prompt'); updateStatusText.style.color = 'inherit'; } });

            window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(addModal); closeModal(settingsModal); closeModal(addGroupModal); } });
        }

        return {
            init,
            openAddModal,
            openSettingsModal
        };
    };
})(window);