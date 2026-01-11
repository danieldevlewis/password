import './password_hasher.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./worker.js');
}
