// js/camera-list.js

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createCameraList = function(App) {
    const cameraListContainer = document.getElementById('camera-list-container');
    const openRecordingsBtn = document.getElementById('open-recordings-btn');

    async function pollCameraStatuses() {
        for (const camera of App.cameras) {
            const statusIcon = document.getElementById(`status-icon-${camera.id}`);
            if (statusIcon) {
                const pulse = await window.api.getCameraPulse(camera);
                statusIcon.classList.toggle('online', pulse.success);
            }
        }
    }

    async function deleteCamera(cameraId) {
        if (confirm(App.t('confirm_delete_camera'))) {
            if (App.recordingStates[cameraId]) {
                await window.api.stopRecording(cameraId);
            }
            App.gridManager.removeStreamsForCamera(cameraId);
            App.cameras = App.cameras.filter(c => c.id !== cameraId);
            await App.saveConfiguration();
            render();
        }
    }

    function render() {
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
                cameraItem.innerHTML = `<i class="status-icon" id="status-icon-${camera.id}"></i><span>${camera.name}</span><div class="rec-indicator"></div>`;
                if (App.recordingStates[camera.id]) {
                    cameraItem.classList.add('recording');
                }
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
                    const camera = App.cameras.find(c => c.id === cameraId);
                    if (camera && camera.groupId !== group.id) {
                        camera.groupId = group.id;
                        App.saveConfiguration();
                        render();
                    }
                });
            }
    
            return groupContainer;
        };

        App.groups.forEach(group => {
            const camerasInGroup = App.cameras.filter(c => c.groupId === group.id);
            cameraListContainer.appendChild(createGroupHTML(group, camerasInGroup));
        });

        const ungroupedCameras = App.cameras.filter(c => !c.groupId);
        if (ungroupedCameras.length > 0) {
            const ungroupedPseudoGroup = { id: null, name: App.t('ungrouped_cameras') };
            cameraListContainer.appendChild(createGroupHTML(ungroupedPseudoGroup, ungroupedCameras));
        }

        if (cameraListContainer.innerHTML === '') {
            cameraListContainer.innerHTML = `<p style="padding: 10px; color: var(--text-secondary);">${App.t('no_cameras_or_groups')}</p>`;
        }

        pollCameraStatuses();
    }
    
    function updateRecordingState(cameraId, isRecording) {
        const cameraItem = cameraListContainer.querySelector(`.camera-item[data-camera-id='${cameraId}']`);
        if (cameraItem) {
            cameraItem.classList.toggle('recording', isRecording);
        }
    }

    function init() {
        openRecordingsBtn.addEventListener('click', () => window.api.openRecordingsFolder());
        
        cameraListContainer.addEventListener('contextmenu', (e) => {
            const cameraItem = e.target.closest('.camera-item');
            if (cameraItem) {
                e.preventDefault();
                const cameraId = parseInt(cameraItem.dataset.cameraId, 10);
                const labels = {
                    files: `🗂️  ${App.t('context_file_manager')}`,
                    ssh: `💻  ${App.t('context_ssh')}`,
                    settings: `⚙️  ${App.t('context_settings')}`,
                    edit: `✏️  ${App.t('context_edit')}`,
                    delete: `🗑️  ${App.t('context_delete')}`
                };
                window.api.showCameraContextMenu({ cameraId, labels });
            }
        });

        window.api.onContextMenuCommand(({ command, cameraId }) => {
            const camera = App.cameras.find(c => c.id === cameraId);
            if (!camera) return;

            // Создаем чистый объект для передачи через IPC
            const cameraData = {
                id: camera.id,
                name: camera.name,
                ip: camera.ip,
                port: camera.port,
                username: camera.username,
                password: camera.password,
                streamPath0: camera.streamPath0,
                streamPath1: camera.streamPath1
            };

            switch(command) {
                case 'files': window.api.openFileManager(cameraData); break;
                case 'ssh': window.api.openSshTerminal(cameraData); break;
                case 'settings': App.modalHandler.openSettingsModal(cameraId); break;
                case 'edit': App.modalHandler.openAddModal(cameraData); break;
                case 'delete': deleteCamera(cameraId); break;
            }
        });
    }

    return {
        init,
        render,
        pollCameraStatuses,
        updateRecordingState
    }
}
})(window);