import {
  existsSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync
} from 'fs';

/**
 * @namespace Cleaner
 * @description - Cleans project by removing several files & folders.
 * @see scripts\dispatch.js cleanProject() for complete list
 */
export class Cleaner {
  removePath = (pathToRemove: string) => {

    if (existsSync(pathToRemove)) {
      console.log(`Removing: ${pathToRemove}`);

      if (statSync(pathToRemove).isFile()) unlinkSync(pathToRemove);
      else {
        const files = readdirSync(pathToRemove);

        files.forEach((file: string) => {
          const filePath = `${pathToRemove}/${file}`;

          if (statSync(filePath).isDirectory()) this.removePath(filePath);
          else unlinkSync(filePath);
        });
        rmdirSync(pathToRemove);
      }
    }
  };
}
