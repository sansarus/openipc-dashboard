// js/renderer.js (полная исправленная версия с системой пользователей и сворачиваемым сайдбаром)

(function(window) {
    'use strict';
    
    const App = {};
    window.App = App;

    App.stateManager = AppModules.createStateManager({
        initialState: {
            cameras: [],
            groups: [],
            gridState: Array(64).fill(null),
            layout: { cols: 2, rows: 2 },
            recordingStates: {},
            appSettings: {},
            isSaving: false,
            currentUser: null,
        },
        mutations: {
            setInitialConfig(state, config) { 
                state.cameras = config.cameras || []; 
                state.groups = config.groups || []; 
                state.layout = config.layout || { cols: 2, rows: 2 }; 
                state.gridState = config.gridState ? config.gridState.map(s => s ? { ...s } : null) : Array(64).fill(null); 
            },
            setAppSettings(state, settings) { 
                state.appSettings = { ...state.appSettings, ...settings }; 
                App.saveAppSettings(); 
            },
            updateGridState(state, gridState) { 
                state.gridState = gridState; 
                App.saveConfiguration(); 
            },
            updateGridLayout(state, layout) { 
                state.layout = layout; 
                App.saveConfiguration(); 
            },
            addCamera(state, camera) { 
                state.cameras = [...state.cameras, { id: Date.now(), groupId: null, ...camera }]; 
                App.saveConfiguration(); 
            },
            updateCamera(state, updatedCamera) { 
                state.cameras = state.cameras.map(c => c.id === updatedCamera.id ? { ...c, ...updatedCamera } : c); 
                App.saveConfiguration(); 
            },
            deleteCamera(state, cameraId) {
                state.gridState = state.gridState.map(cell => {
                    if (cell && cell.camera.id === cameraId) {
                        return null;
                    }
                    return cell;
                });
                
                state.cameras = state.cameras.filter(c => c.id !== cameraId); 
                
                App.saveConfiguration(); 
            },
            addGroup(state, group) { 
                state.groups = [...state.groups, { id: Date.now(), ...group }]; 
                App.saveConfiguration(); 
            },
            setRecordingState(state, { cameraId, recording }) { 
                state.recordingStates = { ...state.recordingStates, [cameraId]: recording }; 
            },
            setCurrentUser(state, user) {
                state.currentUser = user;
            },
            logout(state) {
                state.currentUser = null;
            }
        }
    });
    
    App.t = (key) => key;
    
    App.i18n = AppModules.createI18n(App);
    App.modalHandler = AppModules.createModalHandler(App);
    App.cameraList = AppModules.createCameraList(App);
    App.gridManager = AppModules.createGridManager(App);
    App.archiveManager = AppModules.createArchiveManager(App);
    App.windowControls = AppModules.createWindowControls(App);

    const loginView = document.getElementById('login-view');
    const mainAppContainer = document.getElementById('main-app-container');
    const loginBtn = document.getElementById('login-btn');
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const statusInfo = document.getElementById('status-info');

    async function loadConfiguration() { const config = await window.api.loadConfiguration(); App.stateManager.setInitialConfig(config); }
    async function loadAppSettings() { App.stateManager.state.appSettings = await window.api.loadAppSettings(); }
    App.saveAppSettings = async () => { await window.api.saveAppSettings(App.stateManager.state.appSettings); };
    
    async function saveConfiguration() {
        const state = App.stateManager.state;
        if (state.isSaving) return;
        state.isSaving = true;
        
        const config = {
            cameras: state.cameras.map(c => { const { player, ...rest } = c; return rest; }),
            groups: state.groups,
            gridState: App.gridManager.getGridState(),
            layout: state.layout,
        };
        try { await window.api.saveConfiguration(config); } finally { setTimeout(() => { state.isSaving = false; }, 100); }
    }
    App.saveConfiguration = saveConfiguration;

    async function toggleRecording(camera) {
        if (App.stateManager.state.recordingStates[camera.id]) { 
            await window.api.stopRecording(camera.id); 
        } 
        else { 
            const fullCameraInfo = App.stateManager.state.cameras.find(c => c.id === camera.id);
            await window.api.startRecording(fullCameraInfo); 
        }
    }
    App.toggleRecording = toggleRecording;

    function updateSystemStats() { window.api.getSystemStats().then(stats => { statusInfo.textContent = `${App.t('status_cpu')}: ${stats.cpu}% | ${App.t('status_ram')}: ${stats.ram} MB`; }); }

    function initPresentationMode() {
        const presentationBtn = document.getElementById('presentation-mode-btn');
        presentationBtn.addEventListener('click', () => {
            document.body.classList.toggle('presentation-mode');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50); 
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('presentation-mode')) {
                document.body.classList.remove('presentation-mode');
                 setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            }
        });
    }

    async function handleLogin() {
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        loginError.textContent = '';
        if (!username || !password) return;

        loginBtn.disabled = true;
        loginBtn.textContent = App.t('connecting');

        try {
            const result = await window.api.login({ username, password });
            if (result.success) {
                App.stateManager.setCurrentUser(result.user);
                loginView.classList.add('hidden');
                mainAppContainer.classList.remove('hidden');
                loginPassword.value = ''; 
            } else {
                loginError.textContent = App.t('invalid_credentials');
            }
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = App.t('login_btn');
        }
    }
    
    function handleLogout() {
        App.stateManager.logout();
        mainAppContainer.classList.add('hidden');
        loginView.classList.remove('hidden');
        document.body.className = ''; // Сброс всех классов
        loginUsername.focus();
    }

    window.api.onRecordingStateChange(({ cameraId, recording }) => App.stateManager.setRecordingState({ cameraId, recording }));
    window.api.onStreamDied(uniqueStreamIdentifier => App.gridManager.handleStreamDeath(uniqueStreamIdentifier));
    window.api.onStreamStats(({ uniqueStreamIdentifier, fps, bitrate }) => { const statsDiv = document.getElementById(`stats-${uniqueStreamIdentifier}`); if(statsDiv) statsDiv.textContent = `${Math.round(fps)}fps, ${Math.round(bitrate)}kbps`; });

    async function init() {
        await loadAppSettings();
        await App.i18n.init();
        App.t = App.i18n.t;

        App.modalHandler.init();
        App.cameraList.init();
        App.gridManager.init();
        App.archiveManager.init();
        App.windowControls.init();
        initPresentationMode();

        loginBtn.addEventListener('click', handleLogin);
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        logoutBtn.addEventListener('click', handleLogout);
        
        let renderTimeout;
        App.stateManager.subscribe(() => {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                console.log("[Renderer] State change detected. Triggering re-render.");
                App.cameraList.render();
                App.gridManager.render();
                App.gridManager.updateGridLayoutView(); 
            }, 20);

            const user = App.stateManager.state.currentUser;
            // Сначала удаляем все классы ролей и прав
            document.body.className = document.body.className.replace(/role-\w+|can-\w+/g, '').trim();

            if (user) {
                document.body.classList.add(`role-${user.role}`);
                // Если это оператор, добавляем классы для его прав
                if (user.role === 'operator' && user.permissions) {
                    for (const permission in user.permissions) {
                        if (user.permissions[permission]) {
                            document.body.classList.add(`can-${permission.replace(/_/g, '-')}`);
                        }
                    }
                }
            }
        });
        
        await loadConfiguration();
        
        window.addEventListener('language-changed', () => {
            App.cameraList.render();
            App.gridManager.updatePlaceholdersLanguage();
            updateSystemStats();
            if (!loginView.classList.contains('hidden')) {
                App.i18n.applyTranslationsToDOM();
            }
        });

        setInterval(updateSystemStats, 3000);
        setInterval(() => App.cameraList.pollCameraStatuses(), 10000);
        updateSystemStats();
    }

    init();

    (function() {
        const updateStatusInfo = document.createElement('div');
        updateStatusInfo.style.marginLeft = '15px'; updateStatusInfo.style.fontSize = '12px'; updateStatusInfo.style.color = 'var(--text-secondary)';
        const statusBar = document.getElementById('status-info').parentElement;
        if (statusBar) { statusBar.appendChild(updateStatusInfo); }
        window.api.onUpdateStatus(({ status, message }) => {
            const version = message.includes(' ') ? message.split(' ').pop() : '';
            switch (status) {
                case 'available': updateStatusInfo.innerHTML = `💡 <span style="text-decoration: underline; cursor: help;" title="${App.t('update_available', { version })}">${App.t('update_available_short')}</span>`; updateStatusInfo.style.color = '#ffc107'; break;
                case 'downloading': updateStatusInfo.textContent = `⏳ ${App.t('update_downloading', { percent: message.match(/\d+/)[0] })}`; updateStatusInfo.style.color = '#17a2b8'; break;
                case 'downloaded': updateStatusInfo.innerHTML = `✅ <span style="text-decoration: underline; cursor: help;" title="${App.t('update_downloaded')}">${App.t('update_downloaded_short')}</span>`; updateStatusInfo.style.color = '#28a745'; break;
                case 'error': updateStatusInfo.textContent = `❌ ${App.t('update_error_short', { message })}`; updateStatusInfo.style.color = '#dc3545'; break;
                case 'latest': updateStatusInfo.textContent = `👍 ${App.t('update_latest')}`; setTimeout(() => { if (updateStatusInfo.textContent.includes(App.t('update_latest'))) updateStatusInfo.textContent = ''; }, 5000); break;
                default: updateStatusInfo.textContent = ''; break;
            }
        });
    })();
})(window);