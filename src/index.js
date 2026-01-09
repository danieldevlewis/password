import Form from './form.js';

new Form();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('worker.js');
}
