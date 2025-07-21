// js/camera-list.js (Полная версия с изменениями для системы пользователей)

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createCameraList = function(App) {
        const stateManager = App.stateManager;
        const cameraListContainer = document.getElementById('camera-list-container');
        const openRecordingsBtn = document.getElementById('open-recordings-btn');

        async function pollCameraStatuses() {
            for (const camera of stateManager.state.cameras) {
                const statusIcon = document.getElementById(`status-icon-${camera.id}`);
                if (statusIcon) {
                    try {
                        const pulse = await window.api.getCameraPulse(camera);
                        statusIcon.classList.toggle('online', pulse.success);
                    } catch (e) {
                        statusIcon.classList.remove('online');
                    }
                }
            }
        }

        async function deleteCamera(cameraId) {
            if (confirm(App.i18n.t('confirm_delete_camera'))) {
                if (stateManager.state.recordingStates[cameraId]) {
                    await window.api.stopRecording(cameraId);
                }
                stateManager.deleteCamera(cameraId);
            }
        }

        function render() {
            cameraListContainer.innerHTML = '';
            const { cameras, groups, recordingStates } = stateManager.state;
        
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
                    // VVV ИЗМЕНЕНИЕ: Перетаскивание доступно только администратору VVV
                    cameraItem.draggable = App.stateManager.state.currentUser?.role === 'admin';
                    // ^^^ КОНЕЦ ИЗМЕНЕНИЯ ^^^
                    cameraItem.innerHTML = `<i class="status-icon" id="status-icon-${camera.id}"></i><span>${camera.name}</span><div class="rec-indicator"></div>`;
                    if (recordingStates[camera.id]) {
                        cameraItem.classList.add('recording');
                    }
                    cameraItem.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', camera.id.toString()); });
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
                            stateManager.updateCamera({ ...camera, groupId: group.id });
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
                const ungroupedPseudoGroup = { id: null, name: App.i18n.t('ungrouped_cameras') };
                cameraListContainer.appendChild(createGroupHTML(ungroupedPseudoGroup, ungroupedCameras));
            }

            if (cameraListContainer.innerHTML === '') {
                cameraListContainer.innerHTML = `<p style="padding: 10px; color: var(--text-secondary);">${App.i18n.t('no_cameras_or_groups')}</p>`;
            }

            pollCameraStatuses();
        }

        function init() {
            openRecordingsBtn.addEventListener('click', () => window.api.openRecordingsFolder());
            
            cameraListContainer.addEventListener('contextmenu', (e) => {
                const currentUser = App.stateManager.state.currentUser;
                // VVV ИЗМЕНЕНИЕ: Блокируем контекстное меню для операторов без прав VVV
                if (currentUser?.role !== 'admin' && !(currentUser.permissions?.edit_cameras || currentUser.permissions?.delete_cameras || currentUser.permissions?.access_settings || currentUser.permissions?.view_archive)) {
                    e.preventDefault();
                    return;
                }
                // ^^^ КОНЕЦ ИЗМЕНЕНИЯ ^^^

                const cameraItem = e.target.closest('.camera-item');
                if (cameraItem) {
                    e.preventDefault();
                    const cameraId = parseInt(cameraItem.dataset.cameraId, 10);
                    // Динамически строим меню на основе прав
                    const menuItems = {};
                    
                    menuItems.open_in_browser = `🌐  ${App.i18n.t('context_open_in_browser')}`;
                    menuItems.files = `🗂️  ${App.i18n.t('context_file_manager')}`;
                    menuItems.ssh = `💻  ${App.i18n.t('context_ssh')}`;

                    if (currentUser.role === 'admin' || currentUser.permissions?.view_archive) {
                        menuItems.archive = `🗄️  ${App.i18n.t('archive_title')}`;
                    }
                    if (currentUser.role === 'admin' || currentUser.permissions?.access_settings) {
                        menuItems.settings = `⚙️  ${App.i18n.t('context_settings')}`;
                    }
                    if (currentUser.role === 'admin' || currentUser.permissions?.edit_cameras) {
                        menuItems.edit = `✏️  ${App.i18n.t('context_edit')}`;
                    }
                    if (currentUser.role === 'admin' || currentUser.permissions?.delete_cameras) {
                        menuItems.delete = `🗑️  ${App.i18n.t('context_delete')}`;
                    }

                    window.api.showCameraContextMenu({ cameraId, labels: menuItems });
                }
            });

            window.api.onContextMenuCommand(({ command, cameraId }) => {
                const camera = stateManager.state.cameras.find(c => c.id === cameraId);
                if (!camera) return;

                const cameraDataForIPC = {
                    id: camera.id,
                    name: camera.name,
                    ip: camera.ip,
                    port: camera.port,
                    username: camera.username,
                    password: camera.password,
                    streamPath0: camera.streamPath0,
                    streamPath1: camera.streamPath1,
                    groupId: camera.groupId
                };

                switch(command) {
                    case 'open_in_browser': 
                        window.api.openInBrowser(cameraDataForIPC.ip); 
                        break;
                    case 'files': window.api.openFileManager(cameraDataForIPC); break;
                    case 'ssh': window.api.openSshTerminal(cameraDataForIPC); break;
                    case 'archive': App.archiveManager.openArchiveForCamera(camera); break;
                    case 'settings': App.modalHandler.openSettingsModal(cameraId); break;
                    case 'edit': App.modalHandler.openAddModal(cameraDataForIPC); break;
                    case 'delete': deleteCamera(cameraId); break;
                }
            });
        }

        return {
            init,
            render,
            pollCameraStatuses
        }
    }
})(window);