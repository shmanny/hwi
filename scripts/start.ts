import { spawn, spawnSync, SpawnOptions } from 'child_process'
import getPort from 'get-port'
import axios from 'axios'
/**
 * @namespace Starter
 * @description - Scripts to start Electron, React, and Python.
 */
export class Starter {
  /**
   * @description - Starts developer mode.
   * @memberof Starter
   */
  developerMode = async () => {
    type OptionsType = {
      hideLogs:  SpawnOptions,
      showLogs:  SpawnOptions
    }
    // Child spawn options for console
    const spawnOptions: OptionsType = {
      hideLogs: { detached: false, shell: true, stdio: 'pipe' },
      showLogs: { detached: false, shell: true, stdio: 'inherit' }
    };

    /**
     * Method to get first port in range of 3001-3999,
     * Remains unused here so will be the same as the
     * port used in main.js
     */
    const port = await getPort({
      port: getPort.makeRange(3001, 3999)
    });

    // Kill anything that might using required React port
    spawnSync('npx kill-port 3000', spawnOptions.hideLogs);

    // Start & identify React & Electron processes
    spawn('cross-env BROWSER=none react-scripts start', spawnOptions.showLogs);
    spawn('tsx electron .', spawnOptions.showLogs);

    // Kill processes on exit
    const exitOnEvent = (event: string) => {
      process.once(event, () => {
        try {
          // These errors are expected since the connection is closing
          const expectedErrors = ['ECONNRESET', 'ECONNREFUSED'];

          // Send command to Flask server to quit and close
          axios.get(`http://localhost:${port}/quit`).catch(
            (error: any) => !expectedErrors.includes(error.code) && console.log(error)
          );
        } catch (error: any) {
          // This errors is expected since the process is closing
          if (error.code !== 'ESRCH') console.error(error);
        }
      });
    };

    // Set exit event handlers
    [
      'exit',
      'SIGINT',
      'SIGTERM',
      'SIGUSR1',
      'SIGUSR2',
      'uncaughtException'
    ].forEach(exitOnEvent);
  };
}