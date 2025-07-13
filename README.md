# Dashboard

![OpenIPC Dashboard Screenshot](build/screenshot.png) 
<!-- Замените URL на прямую ссылку на ваш скриншот, когда загрузите его в репозиторий -->

**Dashboard** is a cross—platform desktop application for easy camera management and monitoring based on the OpenIPC firmware.

The application was created using Electron and provides a single interface for viewing video streams, administering settings, working with the file system, and direct access to the camera's command line.

---

## 🚀 Main features

* **Multi-view:** View up to 4 video streams simultaneously in a customizable grid.
* **Double flow:** Instantly switch between the main (HD) and secondary (SD) streams with a double click.
* **Full-screen mode:** Detailed full-screen viewing of a single camera.
* **Built-in SSH client:** A full-fledged terminal for direct access to the camera's command line without the need for third-party programs.
* **File Manager (SCP):** Convenient two-panel manager for downloading firmware, downloading recordings and managing files on the camera.
* **Settings Editor:** Graphical interface for changing all parameters of the Majestic firmware (`majestic.yaml`) grouped by tabs.
* **Monitoring:** Displays the status (online/offline) and temperature of the SoC camera in real time.
* **Cross-platform:** Works on Windows, macOS and Linux.

## , Installation

The ready-made installation files for the latest version can be found on the **[Releases] page(https://github.com/Rinibr/openipc-dashboard/releases )**.

<!-- Replace 'Rinibr/openipc-dashboard' with your path if it differs -->

#### Windows
1. Download the file `OpenIPC-Dashboard-Setup-x.x.x.exe `.
2. Run the installer and follow the instructions.

#### macOS
1. Download the file `OpenIPC-Dashboard-x.x.x.dmg'.
2. Open the `.dmg` file and drag and drop the `OpenIPC Dashboard.app' into the Applications folder.

#### Linux
1. Download the file `OpenIPC-Dashboard-x.x.x.AppImage'.
2. Make the file executable:
    ```bash
    chmod +x OpenIPC-Dashboard-x.x.x.AppImage
    ```
3. Launch the app:
    ```bash
    ./OpenIPC-Dashboard-x.x.x.AppImage
    ```

---

## 🛠️ For developers

### Technology stack
*   [Electron](https://www.electronjs.org/)
*   [Node.js](https://nodejs.org/)
*   HTML, CSS, JavaScript (Vanilla JS)
* [JSMpeg](https://jsmpeg.com /) for video decoding
* [ssh2](https://github.com/mscdex/ssh2 ) for SSH and SCP
The finished files will appear in the dist folder.
