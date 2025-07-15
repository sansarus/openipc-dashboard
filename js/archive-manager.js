(function(window) {
    window.AppModules = window.AppModules || {};

    AppModules.createArchiveManager = function(App) {
    const archiveModal = document.getElementById('archive-modal');
    const archiveModalCloseBtn = document.getElementById('archive-modal-close-btn');
    const archiveListEl = document.getElementById('archive-list');
    const archiveRefreshBtn = document.getElementById('archive-refresh-btn');
    const archiveVideoPlayer = document.getElementById('archive-video-player');
    const archivePlayerPlaceholder = document.getElementById('archive-player-placeholder');
    const archiveDeleteBtn = document.getElementById('archive-delete-btn');
    const archiveShowFolderBtn = document.getElementById('archive-show-folder-btn');
    const openArchiveBtn = document.getElementById('open-archive-btn');

    let selectedArchiveFile = null;

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    async function loadArchiveList() {
        archiveListEl.innerHTML = `<li>${App.t('loading_text')}</li>`;
        const files = await window.api.getRecordingsList();
        archiveListEl.innerHTML = '';

        if (files.length === 0) {
            archiveListEl.innerHTML = `<li>${App.t('archive_no_recordings')}</li>`;
            return;
        }

        files.forEach(file => {
            const li = document.createElement('li');
            li.dataset.filename = file.name;
            const date = new Date(file.createdAt).toLocaleString();
            li.innerHTML = `<div class="file-name">${file.name}</div><div class="file-meta">${date} - ${formatBytes(file.size)}</div>`;
            li.addEventListener('click', () => {
                selectedArchiveFile = file.name;
                archiveListEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
                playArchiveFile(file.name);
            });
            archiveListEl.appendChild(li);
        });
    }

    function playArchiveFile(filename) {
        archivePlayerPlaceholder.style.display = 'none';
        archiveVideoPlayer.style.display = 'block';
        archiveVideoPlayer.src = `video-archive://${encodeURIComponent(filename)}`;
        archiveVideoPlayer.play();
        archiveDeleteBtn.disabled = false;
        archiveShowFolderBtn.disabled = false;
    }

    function resetArchivePlayer() {
        selectedArchiveFile = null;
        archiveVideoPlayer.pause();
        archiveVideoPlayer.removeAttribute('src');
        archiveVideoPlayer.load();
        archiveVideoPlayer.style.display = 'none';
        archivePlayerPlaceholder.style.display = 'block';
        archiveDeleteBtn.disabled = true;
        archiveShowFolderBtn.disabled = true;
        archiveListEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    }

    function init() {
        openArchiveBtn.addEventListener('click', () => {
            archiveModal.classList.remove('hidden');
            loadArchiveList();
            resetArchivePlayer();
        });
        archiveModalCloseBtn.addEventListener('click', () => archiveModal.classList.add('hidden'));
        archiveRefreshBtn.addEventListener('click', loadArchiveList);

        archiveDeleteBtn.addEventListener('click', async () => {
            const confirmationMessage = App.t('confirm_delete_recording', { filename: selectedArchiveFile });
            if (!selectedArchiveFile || !confirm(confirmationMessage)) return;

            const result = await window.api.deleteRecording(selectedArchiveFile);
            if (result.success) {
                console.log('File deleted.');
                resetArchivePlayer();
                loadArchiveList();
            } else {
                alert(`${App.t('error_deleting')}: ${result.error}`);
            }
        });

        archiveShowFolderBtn.addEventListener('click', () => {
            if (selectedArchiveFile) window.api.showRecordingInFolder(selectedArchiveFile);
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') archiveModal.classList.add('hidden');
        });
    }

    return { init };
}
})(window);