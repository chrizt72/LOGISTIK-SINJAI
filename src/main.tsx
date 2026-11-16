import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Versi baru SIMLOG PLN tersedia.');
  },
  onOfflineReady() {
    console.log('Aplikasi SIMLOG PLN siap digunakan secara offline.');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
