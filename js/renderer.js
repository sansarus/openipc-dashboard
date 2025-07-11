// js/renderer.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Global Application State & Modules ---
    const App = {
        cameras: [],
        groups: [],
        appSettings: {},
        recordingStates: {},
        modalHandler: null,
        cameraList: null,
        gridManager: null,
        archiveManager: null,

        async saveConfiguration() {
            try {
                const { cols, rows } = this.gridManager.getGridSize();
                const gridState = this.gridManager.getGridState().map(state => {
                    if (!state || !state.camera) return null;
                    return { cameraId: state.camera.id, streamId: state.streamId };
                });

                const config = {
                    cameras: this.cameras,
                    groups: this.groups,
                    layout: { cols, rows },
                    gridState: gridState
                };
                await window.api.saveConfiguration(config);
                console.log('Configuration saved.');
            } catch (error) {
                console.error('Failed to save configuration:', error);
            }
        },

        async toggleRecording(camera) {
            const isRecording = this.recordingStates[camera.id];
            if (isRecording) {
                await window.api.stopRecording(camera.id);
            } else {
                const result = await window.api.startRecording(camera);
                if (!result.success) {
                    // В реальном приложении лучше использовать кастомный toast или alert
                    alert(`Ошибка начала записи: ${result.error}`);
                }
            }
        }
    };
    
    // --- Initialization ---
    async function initialize() {
        console.log('Initializing application...');
        
        // Create module instances from the global namespace
        App.modalHandler = AppModules.createModalHandler(App);
        App.cameraList = AppModules.createCameraList(App);
        App.gridManager = AppModules.createGridManager(App);
        App.archiveManager = AppModules.createArchiveManager(App);

        // Load configuration
        App.appSettings = await window.api.loadAppSettings();
        const config = await window.api.loadConfiguration();
        App.cameras = Array.isArray(config.cameras) ? config.cameras : [];
        App.groups = Array.isArray(config.groups) ? config.groups : [];
        console.log(`Loaded ${App.cameras.length} cameras and ${App.groups.length} groups.`);
        
        const MAX_GRID_SIZE = 64; // This constant should ideally be shared among modules
        const gridState = {
            layout: config.layout || { cols: 2, rows: 2 },
            gridState: (Array.isArray(config.gridState) ? config.gridState : []).map(state => {
                if (state && state.cameraId) {
                    const camera = App.cameras.find(c => c.id === state.cameraId);
                    return camera ? { camera, player: null, streamId: state.streamId } : null;
                }
                return null;
            }).concat(Array(MAX_GRID_SIZE).fill(null)).slice(0, MAX_GRID_SIZE)
        };

        // Init modules
        App.modalHandler.init();
        App.cameraList.init();
        App.gridManager.init();
        App.archiveManager.init();
        
        // Render UI
        App.gridManager.setInitialState(gridState);
        await App.gridManager.render();
        App.cameraList.render();

        // Setup periodic tasks
        setInterval(updateSystemStats, 2000);
        setInterval(() => App.cameraList.pollCameraStatuses(), 60000);

        setupApiListeners();
    }

    async function updateSystemStats() {
        try {
            const statusInfoEl = document.getElementById('status-info');
            const stats = await window.api.getSystemStats();
            statusInfoEl.textContent = `CPU: ${stats.cpu}% | RAM: ${stats.ram}MB`;
        } catch (error) {
            console.error("Failed to get system stats:", error);
            // In case the element is not found, do not crash
            const statusInfoEl = document.getElementById('status-info');
            if(statusInfoEl) statusInfoEl.textContent = "Stats unavailable";
        }
    }

    function setupApiListeners() {
        window.api.onRecordingStateChange(({ cameraId, recording, path, error }) => {
            App.recordingStates[cameraId] = recording;
            App.cameraList.updateRecordingState(cameraId, recording);
            App.gridManager.updateRecordingState(cameraId, recording);
            if (error) alert(`Ошибка записи: ${error}`);
        });
        
        window.api.onStreamStats((stats) => {
            const statsElement = document.getElementById(`stats-${stats.uniqueStreamIdentifier}`);
            if (statsElement) {
                const fps = stats.fps.toFixed(1);
                const bitrate = stats.bitrate.toFixed(0);
                statsElement.textContent = `FPS: ${fps} | ${bitrate}kb/s`;
            }
        });
        
        window.api.onStreamDied((uniqueStreamIdentifier) => {
            App.gridManager.handleStreamDeath(uniqueStreamIdentifier);
        });
    }

    // --- Start the App ---
    initialize();
});