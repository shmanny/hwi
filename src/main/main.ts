// Built-in modules
import { spawn } from 'child_process';
import path from 'path';

// Electron modules
import { app, BrowserWindow, ipcMain } from 'electron';

// Extra modules
import getPort from 'get-port';
import isDevMode from'electron-is-dev';
import axios from 'axios'
import installer, { REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS } from 'electron-devtools-installer'


export default class Main {
  static mainWindow: BrowserWindow | null
  static loadingWindow: BrowserWindow
  static application: Electron.App
  static BrowserWindow: BrowserWindow;
  static port: number
  
  private static onWindowAllClose() {
    if (process.platform !== 'darwin') {
      Main.shutdown()
    }
  }

  private static shutdown() {
    axios.get(`http://localhost:${Main.port}/quit`)
      .then(Main.application.quit)
      .catch(Main.application.quit);
  }

  /**
    * Method to set port in range of 3001-3999,
    * based on availability.
  */
  private static async createPort() {
    return getPort({
      port: getPort.makeRange(3001, 3999)
    })
  }

  private static async onReady() {
    const port = await getPort({
      port: getPort.makeRange(3001, 3999)
    });

    /**
     * Assigns the main browser window on the
     * browserWindows object.
     */
    Main.mainWindow = new BrowserWindow({
      frame: false,
      webPreferences: {
        contextIsolation: false,
        enableRemoteModule: true,
        nodeIntegration: true,
        preload: path.join(app.getAppPath(), 'preload.js')
      }
    })

    /**
     * If not using in production, use the loading window
     * and run Flask in shell.
     */
    if (isDevMode) {
      await Main.installExtensions(); // React, Redux devTools
      Main.loadingWindow = new BrowserWindow({ frame: false });
      Main.createLoadingWindow().then(() => Main.createMainWindow());
      spawn(`python app.py ${port}`, { detached: true, shell: true, stdio: 'inherit' });
    }

    /**
     * If using in production, use the main window and run bundled
     * app (dmg, elf, or exe) file
     */

    else {
      Main.createMainWindow()

      // Dynamic script assignment for starting Flask in production
      const runFlask = Main.getRunFlaskScript()
      
      spawn(`${runFlask} ${port}`, { detached: false, shell: true, stdio: 'pipe' });
    }

  }

  private static onActivate() {
    /**
     * On macOS, it's common to re-create a window in the app when the
     * dock icon is clicked and there are no other windows open.
     */

    if (BrowserWindow.getAllWindows().length === 0) Main.createMainWindow()
  }

  /**
   * @description - Creates main window
   * @param {number} port - Port that Flask server is running on 
   */
  private static createMainWindow() {
    if (!Main.mainWindow) throw new Error('Main window not currently set')
    const port = Main.port;
    /**
     * @description - Function to use custom Javascript in the DOM.
     * @param {string} command - Javascript to execute in DOM.
     * @param {function} callback - Callback to execture here once complete.
     * @returns {Promise}
     */
    const executeOnWindow = (command: string, callback?: any) => {
      if (Main.mainWindow) {
        Main.mainWindow.webContents.executeJavaScript(command)
          .then(callback)
          .catch(console.error)
      }
    }

    /**
     * If in developer mode, then show a loading window while
     * the app and developer server compile. 
     */
    if (isDevMode) {
      Main.mainWindow.loadURL('http://localhost:3000');
      Main.mainWindow.hide();

      /**
       * Hide loading window and show main window 
       * once the main window is ready
       */
      Main.mainWindow.webContents.on('did-finish-load', () => {
        Main.mainWindow?.webContents.openDevTools({ mode: 'undocked' })

        /**
         * Checks page for errors that may of occured during 
         * hot load process
         */
        const isPageLoaded = `
          var isBodyFull = document.body.innerHTML !== "";
          var isHeadFull = document.head.innerHTML !== "";
          var isLoadSuccess = isBodyFull && isHeadFull;

          isLoadSuccess || Boolean(location.reload());
        `;

        /**
         * @description Updates windows if page is loaded
         * @param {*} isLoaded
         */
        const handleLoad = (isLoaded: boolean) => {
          if (isLoaded && Main.loadingWindow) {
            /**
             * Keep show() & hide() in this order to prevent
             * unresponsive behavior during page load
             */
            Main.mainWindow?.show();
            Main.loadingWindow.hide();
          }
        }

        /**
         * Checks if the page has been populated with React 
         * project and, if so, shows the main page.
         */
        executeOnWindow(isPageLoaded, handleLoad);
      })
    }

    /**
     * If using in production, the built version of the React 
     * project will be used instead of local host
     */
    else {
      Main.mainWindow.loadFile(path.join(__dirname, 'build/index.html'))
    }

    /**
    * @description - Controls the opacity of title bar on focus/blur.
    * @param {number} value - Opacity to set for title bar.
    */
    const setTitleOpacity = (value: number) => `
      if(document.readyState === 'complete') {
        const titleBar = document.getElementById('electron-window-title-text');
        const titleButtons = document.getElementById('electron-window-title-buttons');

        if(titleBar) titleBar.style.opacity = ${value};
        if(titleButtons) titleButtons.style.opacity = ${value};
      }
    `;

    Main.mainWindow.on('focus', () => executeOnWindow(setTitleOpacity(1)));
    Main.mainWindow.on('blur', () => executeOnWindow(setTitleOpacity(0.5)));

    /**
     * Listen and respond to ipcRenderer events on the frontend
     * @see `src\utils\services.js`
     */
     ipcMain.on('app-maximize', (_event, _arg) => Main.mainWindow?.maximize());
     ipcMain.on('app-minimize', (_event, _arg) => Main.mainWindow?.minimize());
     ipcMain.on('app-quit', (_event, _arg) => Main.shutdown());
     ipcMain.on('app-unmaximize', (_event, _arg) => Main.mainWindow?.unmaximize());
     ipcMain.on('get-port-number', (event, _arg) => {
       event.returnValue = port;
     });
  };

  /**
   * @description - Creates a loading window to show while build is created
   * @memberof BrowserWindow
   * @returns void
   */
  private static createLoadingWindow() {
    return new Promise<void>((resolve, reject) => {
      // Variants of developer loading screen
      const loaderConfig = {
        react: 'utilities/loaders/react/index.html',
        redux: 'utilities/loaders/redux/index.html'
      };

      try {
        Main.loadingWindow.loadFile(path.join(__dirname, loaderConfig.redux));

        Main.loadingWindow.webContents.on('did-finish-load', () => {
          Main.loadingWindow.show();
          resolve();
        });

      } catch (error) {
        console.error(error);
        reject();
      }
    })
  }
  
  /**
   * @description - Installs developer extensions.
   * @returns {Promise}
   */
  private static installExtensions() {
    const isForceDownload = Boolean(process.env.UPGRADE_EXTENSIONS)

    const extensions = [REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS]
      .map((extension) => installer(extension, isForceDownload))

    return Promise
      .allSettled(extensions)
      .catch(console.error)
  }

  /**
   * Returns script to run background flask service
   * @returns script to start flask service
   */
  private static getRunFlaskScript(): string {
    const platform = process.platform
    switch (platform) {
      case 'darwin':
        return `open -gj "${path.join(app.getAppPath(), 'resources', 'app.app')}" --args`
      case 'linux':
        return './resources/app/app'
      case 'win32':
        return 'start ./resources/app/app.exe'
      default:
        throw Error('Platform not supported')
    }
  }

  static async main(app: Electron.App) {
    Main.port = await Main.createPort()
    // Main.BrowserWindow = browserWindow
    Main.application = app
    Main.application.on('window-all-closed', Main.onWindowAllClose)
    Main.application.whenReady().then(Main.onReady)
    Main.application.on('activate', Main.onActivate)
  }
}

Main.main(app)