import type { ElectronAPI } from '../electron-api-bridge';

declare global {


  interface Window {


    readonly testrix?: ElectronAPI;


  }


}




export {};
