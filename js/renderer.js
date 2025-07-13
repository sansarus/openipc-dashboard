// js/renderer.js
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
        // ИСПРАВЛЕННЫЙ ПОРЯДОК ИНИЦИАЛИЗАЦИИ
        
        // 1. Сначала загружаем настройки приложения, чтобы знать сохраненный язык
        await loadAppSettings();
        
        // 2. Теперь инициализируем локализацию, которая использует эти настройки
        await App.i18n.init();

        // 3. Делаем важные функции доступными глобально внутри App
        App.saveConfiguration = saveConfiguration;
        App.toggleRecording = toggleRecording;

        // 4. Загружаем основную конфигурацию
        await loadConfiguration();
        
        // 5. Инициализируем все UI-модули
        App.modalHandler.init();
        App.cameraList.init();
        App.gridManager.init();
        App.archiveManager.init();

        // 6. Первичная отрисовка интерфейса
        App.cameraList.render();
        await App.gridManager.render();
        
        // 7. Запускаем периодические задачи
        setInterval(updateSystemStats, 3000);
        setInterval(() => App.cameraList.pollCameraStatuses(), 10000);
        updateSystemStats(); // Первый запуск сразу
    }

    // Запускаем приложение
    init();

})(window);