// js/archive-manager.js (Финальная исправленная версия с масштабированием и корректной синхронизацией времени)

(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createArchiveManager = function(App) {
        const mainView = document.getElementById('main-view');
        const archiveView = document.getElementById('archive-view');
        const archiveBackBtn = document.getElementById('archive-back-btn');
        const archiveCameraNameEl = document.getElementById('archive-camera-name');
        const archiveDatePicker = document.getElementById('archive-date-picker');
        const archiveVideoPlayer = document.getElementById('archive-video-player');
        const archiveVideoPlaceholder = document.getElementById('archive-video-placeholder');
        const timelineRecordingsEl = document.getElementById('timeline-recordings');
        const timelineWrapper = document.getElementById('timeline-wrapper');
        const timelineSelection = document.getElementById('timeline-selection');
        const archiveExportBtn = document.getElementById('archive-export-btn');

        const dayInSeconds = 24 * 60 * 60;
        const MIN_ZOOM = 1;
        const MAX_ZOOM = 24 * 12; // 5-минутный интервал

        let currentCamera = null;
        let isSelecting = false;
        let selectionStartPercent = 0;
        let selectionEndPercent = 0;
        
        let zoomLevel = 1;
        let viewStartSeconds = 0;
        let timeOffsetSeconds = 0; 

        async function openArchiveForCamera(camera) {
            currentCamera = camera;
            mainView.classList.add('hidden');
            archiveView.classList.remove('hidden');

            archiveCameraNameEl.textContent = `${App.t('archive_title')}: ${camera.name}`;
            archiveDatePicker.valueAsDate = new Date();
            
            resetPlayer();
            
            try {
                const timeResult = await window.api.getCameraTime(camera);
                if (timeResult.success && (timeResult.cameraTimestamp || timeResult.systemTime)) {
                    const cameraTimestamp = timeResult.cameraTimestamp || timeResult.systemTime;
                    const localTimestamp = Math.floor(Date.now() / 1000);
                    timeOffsetSeconds = cameraTimestamp - localTimestamp;
                    console.log(`[Archive] Time sync success. Offset: ${timeOffsetSeconds} seconds.`);
                } else {
                    throw new Error(timeResult.error || 'timestamp not found in camera response');
                }
            } catch (e) {
                timeOffsetSeconds = 0;
                console.warn(`[Archive] Time sync failed: ${e.message}. Using file-based time.`);
            }
            
            loadRecordingsForDate();
        }

        function closeArchive() {
            archiveView.classList.add('hidden');
            mainView.classList.remove('hidden');
            currentCamera = null;
            resetPlayer();
        }
        
        function resetZoom() {
            zoomLevel = 1;
            viewStartSeconds = 0;
            timelineWrapper.scrollLeft = 0;
        }

        async function loadRecordingsForDate() {
            if (!currentCamera) return;
            resetZoom();
            const date = archiveDatePicker.value;
            timelineRecordingsEl.innerHTML = '<div>Loading...</div>';

            const recordings = await window.api.getRecordingsForDate({ 
                cameraName: currentCamera.name, 
                date 
            });

            renderTimeline(recordings);
        }

        function renderTimeline(recordings) {
            const timelineContent = document.createDocumentFragment();
            const labelsContainer = document.createElement('div');
            labelsContainer.id = 'timeline-labels';
            const selectionEl = document.createElement('div');
            selectionEl.id = 'timeline-selection';

            timelineContent.appendChild(labelsContainer);
            timelineContent.appendChild(selectionEl);

            resetSelection();

            if (recordings.length === 0) {
                const noRecEl = document.createElement('div');
                noRecEl.style.cssText = "text-align:center; width:100%; color: var(--text-secondary);";
                noRecEl.textContent = App.t('archive_no_recordings');
                timelineContent.appendChild(noRecEl);
            } else {
                recordings.forEach(rec => {
                    const recDate = new Date(rec.startTime);
                    
                    // --- ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ 2.0 ---
                    const startOfDay = new Date(recDate);
                    startOfDay.setHours(0, 0, 0, 0);

                    const fileStartTimeInSeconds = (recDate.getTime() - startOfDay.getTime()) / 1000;
                    
                    const actualStartTimeInSeconds = fileStartTimeInSeconds + timeOffsetSeconds;
                    const durationInSeconds = 300;

                    const leftPercent = (actualStartTimeInSeconds / dayInSeconds) * 100;
                    const widthPercent = (durationInSeconds / dayInSeconds) * 100;

                    if (leftPercent < -1 || leftPercent > 101) return;

                    const block = document.createElement('div');
                    block.className = 'timeline-block';
                    block.style.left = `${leftPercent}%`;
                    block.style.width = `${widthPercent}%`;
                    block.dataset.filename = rec.name;
                    
                    block.addEventListener('click', (e) => {
                        e.stopPropagation();
                        playRecording(rec.name);
                        document.querySelectorAll('.timeline-block.selected').forEach(b => b.classList.remove('selected'));
                        block.classList.add('selected');
                    });
                    timelineContent.appendChild(block);
                });
            }

            timelineRecordingsEl.innerHTML = '';
            timelineRecordingsEl.appendChild(timelineContent);
            updateTimelineView();
        }
        
        function updateTimelineView() {
            timelineRecordingsEl.style.width = `${zoomLevel * 100}%`;
            timelineWrapper.scrollLeft = viewStartSeconds / dayInSeconds * timelineRecordingsEl.offsetWidth;
            renderTimelineLabels();
            updateSelectionView();
        }
        
        function renderTimelineLabels() {
            const labelsContainer = document.getElementById('timeline-labels');
            if (!labelsContainer) return;
            labelsContainer.innerHTML = '';
            
            const visibleSeconds = dayInSeconds / zoomLevel;
            let interval, subInterval;

            if (visibleSeconds > 3 * 3600) { interval = 3600; subInterval = 1800; }
            else if (visibleSeconds > 3600) { interval = 1800; subInterval = 600; }
            else if (visibleSeconds > 1800) { interval = 600; subInterval = 300; }
            else if (visibleSeconds > 600) { interval = 300; subInterval = 60; }
            else { interval = 60; subInterval = 10; }
        
            for (let s = 0; s < dayInSeconds; s += subInterval) {
                const isMajor = s % interval === 0;
                const label = document.createElement('div');
                label.className = `timeline-label ${isMajor ? 'major' : 'minor'}`;
                label.style.left = `${(s / dayInSeconds) * 100}%`;

                if (isMajor) {
                    const h = Math.floor(s / 3600).toString().padStart(2, '0');
                    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
                    const timeString = `${h}:${m}`;
                    label.dataset.time = timeString;
                }
                labelsContainer.appendChild(label);
            }

            const styleId = 'timeline-label-styles';
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl);
            }
            styleEl.textContent = `
                .timeline-label { position: absolute; top: 0; height: 100%; border-left: 1px solid var(--border-color); }
                .timeline-label.minor { border-color: #444; }
                .timeline-label.major { border-color: #777; }
                .timeline-label.major::after { content: attr(data-time); position: absolute; top: 5px; left: 5px; color: var(--text-secondary); font-size: 12px; }
            `;
        }

        function playRecording(filename) {
            archiveVideoPlaceholder.classList.add('hidden');
            archiveVideoPlayer.classList.remove('hidden');
            archiveVideoPlayer.src = `video-archive://${encodeURIComponent(filename)}`;
            archiveVideoPlayer.play();
        }
        
        function resetPlayer() {
            archiveVideoPlayer.pause();
            archiveVideoPlayer.removeAttribute('src');
            archiveVideoPlayer.load();
            archiveVideoPlayer.classList.add('hidden');
            archiveVideoPlaceholder.classList.remove('hidden');
            timelineRecordingsEl.innerHTML = '';
            document.querySelectorAll('.timeline-block.selected').forEach(b => b.classList.remove('selected'));
            resetSelection();
            resetZoom();
            timeOffsetSeconds = 0;
        }

        function resetSelection() {
            const selectionEl = document.getElementById('timeline-selection');
            if (selectionEl) selectionEl.style.display = 'none';
            archiveExportBtn.disabled = true;
            archiveExportBtn.textContent = App.t('archive_export_clip');
            selectionStartPercent = 0;
            selectionEndPercent = 0;
        }

        function updateSelectionView() {
            const selectionEl = document.getElementById('timeline-selection');
            if (!selectionEl) return;
            const start = Math.min(selectionStartPercent, selectionEndPercent);
            const end = Math.max(selectionStartPercent, selectionEndPercent);
            if (end - start <= 0) {
                selectionEl.style.display = 'none';
                return;
            }
            selectionEl.style.left = `${start}%`;
            selectionEl.style.width = `${end - start}%`;
            selectionEl.style.display = 'block';
        }

        function handleTimelineMouseDown(e) {
            isSelecting = true;
            const rect = timelineWrapper.getBoundingClientRect();
            const positionInScrolledContent = timelineWrapper.scrollLeft + e.clientX - rect.left;
            const totalContentWidth = timelineRecordingsEl.offsetWidth;
            selectionStartPercent = (positionInScrolledContent / totalContentWidth) * 100;
            selectionEndPercent = selectionStartPercent;
            updateSelectionView();
            archiveExportBtn.disabled = true;
        }

        function handleTimelineMouseMove(e) {
            if (!isSelecting) return;
            const rect = timelineWrapper.getBoundingClientRect();
            const positionInScrolledContent = timelineWrapper.scrollLeft + e.clientX - rect.left;
            const totalContentWidth = timelineRecordingsEl.offsetWidth;
            let currentPercent = (positionInScrolledContent / totalContentWidth) * 100;
            selectionEndPercent = Math.max(0, Math.min(100, currentPercent));
            updateSelectionView();
        }
        
        function handleTimelineMouseUp(e) {
            if (!isSelecting) return;
            isSelecting = false;
            if (Math.abs(selectionEndPercent - selectionStartPercent) > 0.1) {
                archiveExportBtn.disabled = false;
            } else {
                resetSelection();
            }
        }

        function handleTimelineWheel(e) {
            e.preventDefault();
            const rect = timelineWrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const timeAtCursor = viewStartSeconds + (mouseX / rect.width) * (dayInSeconds / zoomLevel);
            const zoomFactor = 1.25;
            let newZoomLevel = e.deltaY < 0 ? zoomLevel * zoomFactor : zoomLevel / zoomFactor;
            zoomLevel = Math.max(MIN_ZOOM, Math.min(newZoomLevel, MAX_ZOOM));
            let newViewStartSeconds = timeAtCursor - (mouseX / rect.width) * (dayInSeconds / zoomLevel);
            const maxViewStartSeconds = dayInSeconds - (dayInSeconds / zoomLevel);
            viewStartSeconds = Math.max(0, Math.min(newViewStartSeconds, maxViewStartSeconds));
            updateTimelineView();
        }
        
        function handleTimelineScroll(e) {
            const scrollLeft = e.target.scrollLeft;
            const scrollWidth = e.target.scrollWidth;
            const clientWidth = e.target.clientWidth;
            if (scrollWidth <= clientWidth) { viewStartSeconds = 0; }
            else {
                const scrollableWidth = scrollWidth - clientWidth;
                const scrollPercentage = scrollLeft / scrollableWidth;
                const totalHiddenSeconds = dayInSeconds - (dayInSeconds / zoomLevel);
                viewStartSeconds = scrollPercentage * totalHiddenSeconds;
            }
            renderTimelineLabels();
        }
        
        async function handleExport() {
            if (archiveExportBtn.disabled) return;
            archiveExportBtn.disabled = true;
            archiveExportBtn.textContent = App.t('saving_text');
        
            const start = Math.min(selectionStartPercent, selectionEndPercent);
            const end = Math.max(selectionStartPercent, selectionEndPercent);
            
            const selectionStartSeconds = (start / 100) * dayInSeconds;
            const selectionEndSeconds = (end / 100) * dayInSeconds;
        
            let sourceBlock = null;
            const blocks = timelineRecordingsEl.querySelectorAll('.timeline-block');
            for (const block of blocks) {
                const blockStartPercent = parseFloat(block.style.left);
                const blockWidthPercent = parseFloat(block.style.width);
                const blockEndPercent = blockStartPercent + blockWidthPercent;
        
                if (start >= blockStartPercent && end <= blockEndPercent) {
                    sourceBlock = block;
                    break;
                }
            }
        
            if (!sourceBlock) {
                alert(App.t('archive_export_single_file_error'));
                resetSelection();
                return;
            }
        
            const blockStartPercent = parseFloat(sourceBlock.style.left);
            const blockStartSeconds = (blockStartPercent / 100) * dayInSeconds;
        
            const startTimeInFile = (selectionStartSeconds - blockStartSeconds);
            const duration = selectionEndSeconds - selectionStartSeconds;
        
            const result = await window.api.exportArchiveClip({
                sourceFilename: sourceBlock.dataset.filename,
                startTime: startTimeInFile,
                duration: duration
            });
        
            if (result.success) {
                alert(App.t('archive_export_success'));
            } else {
                alert(`${App.t('archive_export_error')}: ${result.error}`);
            }
        
            resetSelection();
        }

        function init() {
            archiveBackBtn.addEventListener('click', closeArchive);
            archiveDatePicker.addEventListener('change', loadRecordingsForDate);
            timelineWrapper.addEventListener('mousedown', handleTimelineMouseDown);
            window.addEventListener('mousemove', handleTimelineMouseMove);
            window.addEventListener('mouseup', handleTimelineMouseUp);
            archiveExportBtn.addEventListener('click', handleExport);
            timelineWrapper.addEventListener('wheel', handleTimelineWheel, { passive: false });
            timelineWrapper.addEventListener('scroll', handleTimelineScroll);
        }

        return { 
            init,
            openArchiveForCamera
        };
    }
})(window);