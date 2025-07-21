// js/modal-handler.js (Финальная версия с разделением модальных окон)

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createModalHandler = function(App) {
        const stateManager = App.stateManager;

        // --- Элементы для разных модальных окон ---
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

        const discoverBtn = document.getElementById('discover-btn');
        const discoverModal = document.getElementById('discover-modal');
        const discoverModalCloseBtn = document.getElementById('discover-modal-close-btn');
        const discoverList = document.getElementById('discover-list');
        const addDiscoveredBtn = document.getElementById('add-discovered-btn');
        const rediscoverBtn = document.getElementById('rediscover-btn');
        
        // VVV Элементы для модального окна управления пользователями VVV
        const userManagementModal = document.getElementById('user-management-modal');
        const userManagementCloseBtn = document.getElementById('user-management-close-btn');
        const userListEl = document.getElementById('user-list');
        const openAddUserModalBtn = document.getElementById('open-add-user-modal-btn');
        
        const addUserModal = document.getElementById('add-user-modal');
        const addUserCloseBtn = document.getElementById('add-user-close-btn');
        const saveUserBtn = document.getElementById('save-user-btn');
        const cancelUserBtn = document.getElementById('cancel-user-btn');
        
        // VVV НОВОЕ: Элементы для модального окна управления правами VVV
        const permissionsModal = document.getElementById('permissions-modal');
        const permissionsModalCloseBtn = document.getElementById('permissions-modal-close-btn');
        const permissionsModalTitle = document.getElementById('permissions-modal-title');
        const permissionsListEl = document.getElementById('permissions-list');
        const savePermissionsBtn = document.getElementById('save-permissions-btn');
        const cancelPermissionsBtn = document.getElementById('cancel-permissions-btn');
        
        let toastTimeout;
        let editingCameraId = null;
        let settingsCameraId = null;
        let rangeSyncFunctions = {};
        let selectedDiscoveredDevice = null;
        let isDiscovering = false;
        let editingPermissionsForUser = null;

        const availablePermissions = [
            { key: 'view_archive', labelKey: 'view_archive', defaultLabel: 'Просмотр архива' },
            { key: 'export_archive', labelKey: 'export_archive', defaultLabel: 'Экспорт из архива' },
            { key: 'edit_cameras', labelKey: 'edit_cameras', defaultLabel: 'Управление камерами' },
            { key: 'delete_cameras', labelKey: 'delete_cameras', defaultLabel: 'Удаление камер' },
            { key: 'access_settings', labelKey: 'access_settings', defaultLabel: 'Доступ к настройкам' },
            { key: 'manage_layout', labelKey: 'manage_layout', defaultLabel: 'Управление сеткой' },
        ];

        const openModal = (modalElement) => modalElement.classList.remove('hidden');
        const closeModal = (modalElement) => {
            if (modalElement) modalElement.classList.add('hidden');
        };

        function showToast(message, isError = false, duration = 3000) { 
            if (toastTimeout) clearTimeout(toastTimeout);
            settingsToast.textContent = message;
            settingsToast.className = 'toast-notification';
            if (isError) settingsToast.classList.add('error');
            settingsToast.classList.add('show');
            toastTimeout = setTimeout(() => { settingsToast.classList.remove('show'); }, duration);
        }

        function setupRangeSync(rangeId) {
            const rangeInput = document.getElementById(rangeId);
            const valueSpan = document.getElementById(`${rangeId}-value`);
            if (!rangeInput || !valueSpan) { return () => {}; }
            const updateValue = () => { valueSpan.textContent = rangeInput.value; };
            rangeInput.addEventListener('input', updateValue);
            const syncFunc = (value) => { if (value !== undefined) { rangeInput.value = value; updateValue(); } };
            rangeSyncFunctions[rangeId] = syncFunc;
            return syncFunc;
        }

        function setFormValue(id, value) {
            if (value === undefined || value === null) return;
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') { el.checked = !!value; }
            else if (el.type === 'range') {
                const syncFunc = rangeSyncFunctions[id];
                if (syncFunc) { syncFunc(value); } else { el.value = value; }
            }
            else { el.value = value; }
        }

        function openAddModal(cameraToEdit = null) {
            editingCameraId = cameraToEdit ? cameraToEdit.id : null;
            const modalTitle = document.getElementById('add-modal-title');
            const camera = cameraToEdit || {};
            modalTitle.textContent = editingCameraId ? App.i18n.t('edit_camera_title') : App.i18n.t('add_camera_title');
            document.getElementById('new-cam-name').value = camera.name || '';
            document.getElementById('new-cam-ip').value = camera.ip || '';
            document.getElementById('new-cam-port').value = camera.port || '554';
            document.getElementById('new-cam-user').value = camera.username || 'root';
            document.getElementById('new-cam-pass').value = ''; 
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
            rangeSyncFunctions = {};
            const isGeneralSettings = !cameraId;
            const camera = isGeneralSettings ? null : stateManager.state.cameras.find(c => c.id === cameraId);

            document.getElementById('settings-modal-title').textContent = isGeneralSettings ? App.i18n.t('general_settings_title') : `${App.i18n.t('camera_settings_title_prefix')}: ${camera.name}`;
            const tabsContainer = settingsModal.querySelector('.tabs');
            const allTabs = tabsContainer.querySelectorAll('.tab-button');
            const allContent = settingsModal.querySelectorAll('.tab-content');
            
            allTabs.forEach(btn => {
                const tabName = btn.dataset.tab;
                const isGeneralTab = tabName === 'tab-general';
                const isCameraTab = !isGeneralTab;

                if (isGeneralSettings) {
                    btn.style.display = isGeneralTab ? 'flex' : 'none';
                } else {
                    btn.style.display = isCameraTab ? 'flex' : 'none';
                }
            });
            
            allContent.forEach(el => el.classList.remove('active'));
            allTabs.forEach(el => el.classList.remove('active'));
            
            if (isGeneralSettings) {
                tabsContainer.querySelector('[data-tab="tab-general"]').classList.add('active');
                document.getElementById('tab-general').classList.add('active');
            } else {
                if (!camera) return;
                tabsContainer.querySelector('[data-tab="tab-system"]').classList.add('active');
                document.getElementById('tab-system').classList.add('active');
            }

            const { appSettings } = stateManager.state;
            recordingsPathInput.value = appSettings.recordingsPath || '';
            languageSelect.value = appSettings.language || 'en';
            hwAccelSelect.value = appSettings.hwAccel || 'auto';
            
            restartMajesticBtn.style.display = isGeneralSettings ? 'none' : 'inline-flex';
            killAllBtnModal.style.display = isGeneralSettings ? 'inline-flex' : 'none';

            openModal(settingsModal);

            if (isGeneralSettings) {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = App.i18n.t('save');
                return;
            }

            ['image.contrast', 'image.hue', 'image.saturation', 'image.luminance', 'jpeg.qfactor', 'jpeg.fps', 'audio.volume', 'audio.outputVolume', 'nightMode.monitorDelay', 'records.maxUsage'].forEach(setupRangeSync);
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = App.i18n.t('loading_text');
            try {
                const settings = await window.api.getCameraSettings(camera);
                if (settings && !settings.error) {
                    for (const section in settings) {
                        if (typeof settings[section] === 'object' && settings[section] !== null) {
                            for (const key in settings[section]) {
                                setFormValue(`${section}.${key}`, settings[section][key]);
                            }
                        }
                    }
                } else {
                    throw new Error(settings?.error || App.i18n.t('unknown_error'));
                }
            } catch (e) {
                alert(`${App.i18n.t('loading_settings_error')}: ${e.message}`);
                closeModal(settingsModal);
            } finally {
                saveSettingsBtn.disabled = false;
                saveSettingsBtn.textContent = App.i18n.t('save');
            }
        }
        
        async function openUserManagementModal() {
            openModal(userManagementModal);
            await renderUserList();
        }

        async function saveCamera() {
            const cameraDataToUpdate = {
                name: document.getElementById('new-cam-name').value.trim(),
                ip: document.getElementById('new-cam-ip').value.trim(),
                port: document.getElementById('new-cam-port').value.trim(),
                username: document.getElementById('new-cam-user').value.trim(),
                streamPath0: document.getElementById('new-cam-stream-path0').value.trim(),
                streamPath1: document.getElementById('new-cam-stream-path1').value.trim()
            };
            
            const password = document.getElementById('new-cam-pass').value;
            if (password) {
                cameraDataToUpdate.password = password;
            }

            if (!cameraDataToUpdate.name || !cameraDataToUpdate.ip) {
                alert(App.i18n.t('name_and_ip_required'));
                return;
            }
            
            if (editingCameraId) {
                const oldCam = stateManager.state.cameras.find(c => c.id === editingCameraId);
                const needsRestart = oldCam.ip !== cameraDataToUpdate.ip ||
                                   oldCam.port !== cameraDataToUpdate.port ||
                                   oldCam.username !== cameraDataToUpdate.username ||
                                   (cameraDataToUpdate.password) ||
                                   oldCam.streamPath0 !== cameraDataToUpdate.streamPath0 ||
                                   oldCam.streamPath1 !== cameraDataToUpdate.streamPath1;
                
                stateManager.updateCamera({ id: editingCameraId, ...cameraDataToUpdate });
                
                if (needsRestart) {
                    setTimeout(() => App.gridManager.restartStreamsForCamera(editingCameraId), 100);
                }
            } else {
                stateManager.addCamera(cameraDataToUpdate);
            }

            closeModal(addModal);
        }

        async function saveNewGroup() { 
            const name = newGroupNameInput.value.trim(); 
            if (!name) { alert(App.i18n.t('group_name_empty_error')); return; } 
            stateManager.addGroup({ name });
            closeModal(addGroupModal);
        }
        
        async function saveSettings() {
            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = App.i18n.t('saving_text');
            if (settingsCameraId === null) {
                stateManager.setAppSettings({
                    recordingsPath: recordingsPathInput.value.trim(),
                    hwAccel: hwAccelSelect.value,
                    language: languageSelect.value,
                });
                showToast(App.i18n.t('app_settings_saved_success'));
            } else {
                const camera = stateManager.state.cameras.find(c => c.id === settingsCameraId);
                if (!camera) { saveSettingsBtn.disabled = false; saveSettingsBtn.textContent = App.i18n.t('save'); return; }
                const settingsDataToSend = {};
                const allSettingElements = settingsModal.querySelectorAll('[id*="."]');
                allSettingElements.forEach(el => {
                    const id = el.id;
                    if (!id || id.startsWith('app-settings-')) return;
                    const parts = id.split('.');
                    if (parts.length !== 2) return;
                    const [section, key] = parts;
                    if (!settingsDataToSend[section]) settingsDataToSend[section] = {};
                    if (el.type === 'checkbox') { settingsDataToSend[section][key] = el.checked; }
                    else if (el.value !== '' && el.value !== null) {
                        if (el.type === 'number' || el.type === 'range') { settingsDataToSend[section][key] = Number(el.value); }
                        else { settingsDataToSend[section][key] = el.value; }
                    }
                });
                if (Object.keys(settingsDataToSend).length > 0) {
                    const result = await window.api.setCameraSettings({ credentials: camera, settingsData: settingsDataToSend });
                    if (result.success) { showToast(App.i18n.t('camera_settings_saved_success')); }
                    else { showToast(`${App.i18n.t('save_settings_error')}: ${result.error}`, true, 5000); }
                } else {
                    showToast(App.i18n.t('app_settings_saved_success'), false);
                }
            }
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = App.i18n.t('save');
        }

        async function restartMajestic() { 
            if (!settingsCameraId) return; 
            const camera = stateManager.state.cameras.find(c => c.id === settingsCameraId); 
            if (!camera) return; 
            const result = await window.api.restartMajestic(camera); 
            if (result.success) { showToast(App.i18n.t('restart_command_sent')); } 
            else { showToast(`${App.i18n.t('restart_error')}: ${result.error}`, true); } 
        }

        async function startDiscovery() {
            if (isDiscovering) return;
            isDiscovering = true;
            
            openModal(discoverModal);
            discoverList.innerHTML = `<li style="padding: 10px; color: #666;">${App.i18n.t('searching_for_cameras')}</li>`;
            addDiscoveredBtn.disabled = true;
            rediscoverBtn.disabled = true;
            selectedDiscoveredDevice = null;
            
            const result = await window.api.discoverOnvifDevices();
            isDiscovering = false;
            rediscoverBtn.disabled = false;
            
            if (result.success && discoverList.children.length === 1 && discoverList.children[0].textContent.includes(App.i18n.t('searching_for_cameras'))) {
                 discoverList.innerHTML = `<li style="padding: 10px; color: #666;">${App.i18n.t('no_cameras_found')}</li>`;
            } else if (!result.success) {
                 discoverList.innerHTML = `<li style="padding: 10px; color: var(--danger-color);">Error: ${result.error}</li>`;
            }
        }

        function addDiscoveredCamera() {
            if (!selectedDiscoveredDevice) return;
            
            const { ip, name, rtspUri } = selectedDiscoveredDevice;
            let streamPath = '/stream0';
            if (rtspUri) {
                try {
                    const match = rtspUri.match(/rtsp:\/\/[^/]+(\/.*)/);
                    if (match && match[1]) {
                        streamPath = match[1];
                    }
                } catch(e) { console.error("Could not parse RTSP URI:", rtspUri, e); }
            }

            const cameraToEdit = {
                name: name,
                ip: ip,
                streamPath0: streamPath,
                streamPath1: streamPath.replace('0', '1')
            };

            closeModal(discoverModal);
            openAddModal(cameraToEdit);
        }

        async function renderUserList() {
            userListEl.innerHTML = `<li>${App.t('loading_text')}</li>`;
            const result = await window.api.getUsers();
            userListEl.innerHTML = '';

            if (result.success) {
                result.users.forEach(user => {
                    const li = document.createElement('li');
                    const isCurrentUser = user.username === App.stateManager.state.currentUser?.username;

                    li.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;";
                    li.innerHTML = `
                        <div>
                            <strong>${user.username}</strong>
                            <small style="color: #666; margin-left: 10px;">(${App.t('role_' + user.role)})</small>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            ${user.role === 'operator' ? `<button class="permissions-btn" data-username="${user.username}">${App.t('permissions_btn', 'Права')}</button>` : ''}
                            <button class="change-pass-btn">${App.t('change_password')}</button>
                            <button class="delete-user-btn" style="color: var(--danger-color);" ${isCurrentUser ? 'disabled' : ''}>${App.t('context_delete')}</button>
                        </div>
                    `;
                    
                    const permissionsBtn = li.querySelector('.permissions-btn');
                    if (permissionsBtn) {
                        permissionsBtn.addEventListener('click', () => openPermissionsModal(user));
                    }

                    li.querySelector('.change-pass-btn').addEventListener('click', async () => {
                        const newPassword = prompt(App.t('enter_new_password_for', { username: user.username }));
                        if (newPassword && newPassword.trim()) {
                            const updateResult = await window.api.updateUserPassword({ username: user.username, password: newPassword });
                            if (updateResult.success) {
                                alert(App.t('password_changed_success'));
                            } else {
                                alert(`${App.t('error')}: ${updateResult.error}`);
                            }
                        }
                    });

                    li.querySelector('.delete-user-btn').addEventListener('click', async () => {
                        if (confirm(App.t('confirm_delete_user', { username: user.username }))) {
                            const deleteResult = await window.api.deleteUser({ username: user.username });
                             if (deleteResult.success) {
                                await renderUserList();
                            } else {
                                alert(`${App.t('error')}: ${deleteResult.error}`);
                            }
                        }
                    });

                    userListEl.appendChild(li);
                });
            } else {
                userListEl.innerHTML = `<li>Error: ${result.error}</li>`;
            }
        }
        
        function openAddUserModal() {
            document.getElementById('add-user-username').value = '';
            document.getElementById('add-user-password').value = '';
            document.getElementById('add-user-role').value = 'operator';
            openModal(addUserModal);
            document.getElementById('add-user-username').focus();
        }

        async function saveNewUser() {
            const username = document.getElementById('add-user-username').value.trim();
            const password = document.getElementById('add-user-password').value;
            const role = document.getElementById('add-user-role').value;

            if (!username || !password) {
                alert(App.t('username_and_password_required'));
                return;
            }

            const result = await window.api.addUser({ username, password, role });
            if (result.success) {
                closeModal(addUserModal);
                await renderUserList();
            } else {
                alert(`${App.t('error')}: ${result.error}`);
            }
        }
        
        // VVV НОВЫЕ ФУНКЦИИ ДЛЯ МОДАЛЬНОГО ОКНА ПРАВ VVV
        function openPermissionsModal(user) {
            editingPermissionsForUser = user;
            permissionsModalTitle.textContent = App.t('permissions_for_user', { username: user.username });
            permissionsListEl.innerHTML = '';

            availablePermissions.forEach(perm => {
                const isChecked = user.permissions && user.permissions[perm.key];
                const item = document.createElement('div');
                item.className = 'form-check-inline';
                item.innerHTML = `
                    <input type="checkbox" id="perm-${perm.key}" data-key="${perm.key}" class="form-check-input" ${isChecked ? 'checked' : ''}>
                    <label for="perm-${perm.key}">${App.t(perm.labelKey, perm.defaultLabel)}</label>
                `;
                permissionsListEl.appendChild(item);
            });

            openModal(permissionsModal);
        }

        async function savePermissions() {
            if (!editingPermissionsForUser) return;

            const newPermissions = {};
            permissionsListEl.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                if (checkbox.checked) {
                    newPermissions[checkbox.dataset.key] = true;
                }
            });

            const result = await window.api.updateUserPermissions({
                username: editingPermissionsForUser.username,
                permissions: newPermissions
            });

            if (result.success) {
                showToast(App.t('permissions_saved_success', 'Права успешно сохранены.'));
                closeModal(permissionsModal);
                await renderUserList(); // Обновляем список, чтобы подтянуть новые данные
            } else {
                alert(`${App.t('error')}: ${result.error}`);
            }
        }
        
        function init() {
            window.api.onOnvifDeviceFound((device) => {
                if (discoverList.children.length > 0 && discoverList.children[0].textContent.includes(App.i18n.t('searching_for_cameras'))) {
                    discoverList.innerHTML = '';
                }

                const existingItem = Array.from(discoverList.children).find(li => li.innerHTML.includes(device.ip));
                if (existingItem) {
                    return;
                }

                const li = document.createElement('li');
                li.style.padding = '10px';
                li.style.cursor = 'pointer';
                li.style.borderBottom = '1px solid #eee';
                li.innerHTML = `<strong>${device.name}</strong><br><small>${device.ip}</small>`;
                
                li.addEventListener('click', () => {
                    discoverList.querySelectorAll('li').forEach(el => el.style.backgroundColor = '');
                    li.style.backgroundColor = '#d4e6f1';
                    selectedDiscoveredDevice = device;
                    addDiscoveredBtn.disabled = false;
                });
                discoverList.appendChild(li);
            });

            const addCameraSidebarBtn = document.getElementById('add-camera-sidebar-btn');
            const addGroupBtn = document.getElementById('add-group-btn');
            const generalSettingsBtn = document.getElementById('general-settings-btn');
            const userManagementBtn = document.getElementById('user-management-btn');
            
            addCameraSidebarBtn.addEventListener('click', () => openAddModal());
            saveCameraBtn.addEventListener('click', saveCamera);
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
            killAllBtnModal.addEventListener('click', async () => { if (confirm(App.i18n.t('kill_all_confirm'))) { const result = await window.api.killAllFfmpeg(); alert(result.message); window.location.reload(); } });
            saveSettingsBtn.addEventListener('click', saveSettings);
            
            discoverBtn.addEventListener('click', startDiscovery);
            rediscoverBtn.addEventListener('click', startDiscovery);
            discoverModalCloseBtn.addEventListener('click', () => closeModal(discoverModal));
            discoverModal.addEventListener('click', (e) => { if (e.target === discoverModal) closeModal(discoverModal); });
            addDiscoveredBtn.addEventListener('click', addDiscoveredCamera);

            // VVV Обработчики для модального окна управления пользователями VVV
            userManagementBtn.addEventListener('click', openUserManagementModal);
            userManagementCloseBtn.addEventListener('click', () => closeModal(userManagementModal));
            userManagementModal.addEventListener('click', (e) => { if (e.target === userManagementModal) closeModal(userManagementModal); });
            openAddUserModalBtn.addEventListener('click', openAddUserModal);
            
            addUserCloseBtn.addEventListener('click', () => closeModal(addUserModal));
            addUserModal.addEventListener('click', (e) => { if (e.target === addUserModal) closeModal(addUserModal); });
            saveUserBtn.addEventListener('click', saveNewUser);
            cancelUserBtn.addEventListener('click', () => closeModal(addUserModal));

            // VVV НОВОЕ: Обработчики для модального окна прав VVV
            savePermissionsBtn.addEventListener('click', savePermissions);
            cancelPermissionsBtn.addEventListener('click', () => closeModal(permissionsModal));
            permissionsModalCloseBtn.addEventListener('click', () => closeModal(permissionsModal));
            permissionsModal.addEventListener('click', (e) => { if (e.target === permissionsModal) closeModal(permissionsModal); });

            languageSelect.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                stateManager.setAppSettings({ language: newLang });
                await App.i18n.setLanguage(newLang);
                if (!addModal.classList.contains('hidden')) { openAddModal(editingCameraId ? stateManager.state.cameras.find(c => c.id === editingCameraId) : null); }
                if (!settingsModal.classList.contains('hidden')) { openSettingsModal(settingsCameraId); }
                if (!addGroupModal.classList.contains('hidden')) { document.getElementById('add-group-modal-title').textContent = App.i18n.t('create_group_title'); }
                if (!discoverModal.classList.contains('hidden')) {
                     document.querySelector('#discover-modal h2').textContent = App.i18n.t('discover_modal_title');
                     document.querySelector('#add-discovered-btn').textContent = App.i18n.t('add_selected_camera');
                     document.querySelector('#rediscover-btn').textContent = App.i18n.t('search_again');
                }
                if (!userManagementModal.classList.contains('hidden')) {
                    document.querySelector('#user-management-modal h2').textContent = App.t('user_management_title');
                }
                if (!addUserModal.classList.contains('hidden')) {
                    document.querySelector('#add-user-modal h2').textContent = App.t('add_user_title');
                }
                showToast(App.i18n.t('app_settings_saved_success'));
            });
            selectRecPathBtn.addEventListener('click', async () => { 
                const result = await window.api.selectDirectory(); 
                if (!result.canceled) { 
                    recordingsPathInput.value = result.path; 
                    stateManager.setAppSettings({ recordingsPath: result.path });
                } 
            });
            
            settingsModal.querySelectorAll('.tab-button').forEach(button => { 
                button.addEventListener('click', () => { 
                    settingsModal.querySelectorAll('.tab-button, .tab-content').forEach(el => el.classList.remove('active')); 
                    button.classList.add('active'); 
                    const tabContent = document.getElementById(button.dataset.tab); 
                    if (tabContent) {
                        tabContent.classList.add('active');
                    } 
                }); 
            });

            checkForUpdatesBtn.addEventListener('click', () => { updateStatusText.textContent = App.i18n.t('update_checking'); checkForUpdatesBtn.disabled = true; window.api.checkForUpdates(); });
            window.api.onUpdateStatus(({ status, message }) => { checkForUpdatesBtn.disabled = false; let version = message.includes(' ') ? message.split(' ').pop() : ''; switch (status) { case 'available': updateStatusText.textContent = App.i18n.t('update_available', { version }); updateStatusText.style.color = '#ffc107'; break; case 'downloading': updateStatusText.textContent = App.i18n.t('update_downloading', { percent: message.match(/\d+/)[0] }); updateStatusText.style.color = '#17a2b8'; checkForUpdatesBtn.disabled = true; break; case 'downloaded': updateStatusText.textContent = App.i18n.t('update_downloaded'); updateStatusText.style.color = '#28a745'; break; case 'error': updateStatusText.textContent = App.i18n.t('update_error', { message }); updateStatusText.style.color = '#dc3545'; break; case 'latest': updateStatusText.textContent = App.i18n.t('update_latest'); updateStatusText.style.color = 'green'; break; default: updateStatusText.textContent = App.i18n.t('update_check_prompt'); updateStatusText.style.color = 'inherit'; } });
            
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeModal(addModal);
                    closeModal(settingsModal);
                    closeModal(addGroupModal);
                    closeModal(discoverModal);
                    closeModal(addUserModal);
                    closeModal(permissionsModal);
                    closeModal(userManagementModal);
                }
            });
        }

        return { init, openAddModal, openSettingsModal };
    };
})(window);