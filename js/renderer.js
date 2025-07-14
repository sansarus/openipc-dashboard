// --- renderer.js ---

(function(window) {
    'use strict';
    
    // Глобальный объект приложения
    const App = {
        cameras: [],
        groups: [],
        gridState: [],
        layout: { cols: 2, rows: 2 },
        recordingStates: {},
        appSettings: {},
        t: (key) => key // Временная функция-заглушка для перевода до инициализации
    };

    // Делаем App доступным глобально, чтобы другие модули могли его использовать
    window.App = App;

    // Инициализация модулей приложения
    App.i18n = AppModules.createI18n(App);
    App.modalHandler = AppModules.createModalHandler(App);
    App.cameraList = AppModules.createCameraList(App);
    App.gridManager = AppModules.createGridManager(App);
    App.archiveManager = AppModules.createArchiveManager(App);

    // Получаем DOM-элемент для отображения статуса
    const statusInfo = document.getElementById('status-info');

    // Загрузка основной конфигурации (камеры, группы, сетка)
    async function loadConfiguration() {
        const config = await window.api.loadConfiguration();
        App.cameras = config.cameras || [];
        App.groups = config.groups || [];
        App.gridManager.setInitialState(config);
    }
    
    // Загрузка настроек самого приложения (путь к записям и т.д.)
    async function loadAppSettings() {
        App.appSettings = await window.api.loadAppSettings();
    }

    // Сохранение текущей конфигурации в файл
    async function saveConfiguration() {
        const config = {
            cameras: App.cameras,
            groups: App.groups,
            gridState: App.gridManager.getGridState(),
            layout: App.gridManager.getGridSize(),
        };
        await window.api.saveConfiguration(config);
    }
    
    // Переключение состояния записи для камеры
    async function toggleRecording(camera) {
        if (App.recordingStates[camera.id]) {
            await window.api.stopRecording(camera.id);
        } else {
            await window.api.startRecording(camera);
        }
    }

    // Обновление информации о загрузке ЦП и использовании ОЗУ
    function updateSystemStats() {
        window.api.getSystemStats().then(stats => {
            statusInfo.textContent = `${App.t('status_cpu')}: ${stats.cpu}% | ${App.t('status_ram')}: ${stats.ram} MB`;
        });
    }

    // --- Обработчики событий от основного процесса ---

    window.api.onRecordingStateChange(({ cameraId, recording }) => {
        App.recordingStates[cameraId] = recording;
        App.cameraList.updateRecordingState(cameraId, recording);
        App.gridManager.updateRecordingState(cameraId, recording);
    });

    window.api.onStreamDied(uniqueStreamIdentifier => {
        App.gridManager.handleStreamDeath(uniqueStreamIdentifier);
    });
    
    window.api.onStreamStats(({ uniqueStreamIdentifier, fps, bitrate }) => {
        const statsDiv = document.getElementById(`stats-${uniqueStreamIdentifier}`);
        if(statsDiv) {
            statsDiv.textContent = `${Math.round(fps)}fps, ${Math.round(bitrate)}kbps`;
        }
    });

    // --- Основная функция инициализации приложения ---
    async function init() {
        await loadAppSettings();
        await App.i18n.init();

        App.saveConfiguration = saveConfiguration;
        App.toggleRecording = toggleRecording;

        await loadConfiguration();
        
        App.modalHandler.init();
        App.cameraList.init();
        App.gridManager.init();
        App.archiveManager.init();

        App.cameraList.render();
        await App.gridManager.render();
        
        // !!! ИЗМЕНЕНИЕ: ДОБАВЛЕН СЛУШАТЕЛЬ ДЛЯ РЕАКЦИИ НА СМЕНУ ЯЗЫКА !!!
        window.addEventListener('language-changed', () => {
            console.log("Language changed, re-rendering components...");
            App.cameraList.render();
            App.gridManager.updatePlaceholdersLanguage();
            updateSystemStats(); // Обновим и статусную строку
        });

        setInterval(updateSystemStats, 3000);
        setInterval(() => App.cameraList.pollCameraStatuses(), 10000);
        updateSystemStats();
    }

    // Запускаем приложение
    init();

    // === НОВЫЙ КОД: ОБРАБОТЧИК СТАТУСА ОБНОВЛЕНИЯ ===
    (function() {
        const updateStatusInfo = document.createElement('div');
        updateStatusInfo.style.marginLeft = '15px';
        updateStatusInfo.style.fontSize = '12px';
        updateStatusInfo.style.color = 'var(--text-secondary)';
        
        const statusBar = document.getElementById('status-info').parentElement;
        if (statusBar) {
            statusBar.appendChild(updateStatusInfo);
        }

        window.api.onUpdateStatus(({ status, message }) => {
            console.log(`Update status: ${status}, message: ${message}`);
            
            const version = message.includes(' ') ? message.split(' ').pop() : '';
            switch (status) {
                case 'available':
                    updateStatusInfo.innerHTML = `💡 <span style="text-decoration: underline; cursor: help;" title="${App.t('update_available', { version })}">${App.t('update_available_short')}</span>`;
                    updateStatusInfo.style.color = '#ffc107';
                    break;
                case 'downloading':
                    updateStatusInfo.textContent = `⏳ ${App.t('update_downloading', { percent: message.match(/\d+/)[0] })}`;
                    updateStatusInfo.style.color = '#17a2b8';
                    break;
                case 'downloaded':
                    updateStatusInfo.innerHTML = `✅ <span style="text-decoration: underline; cursor: help;" title="${App.t('update_downloaded')}">${App.t('update_downloaded_short')}</span>`;
                    updateStatusInfo.style.color = '#28a745';
                    break;
                case 'error':
                    updateStatusInfo.textContent = `❌ ${App.t('update_error_short', { message })}`;
                    updateStatusInfo.style.color = '#dc3545';
                    break;
                case 'latest':
                    updateStatusInfo.textContent = `👍 ${App.t('update_latest')}`;
                    setTimeout(() => { if (updateStatusInfo.textContent.includes(App.t('update_latest'))) updateStatusInfo.textContent = ''; }, 5000);
                    break;
                default:
                    updateStatusInfo.textContent = '';
                    break;
            }
        });
    })();

})(window);