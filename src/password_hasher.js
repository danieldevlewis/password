import generateHash from './native_hasher.js';
import pwnage from './pwnage.js';
import Store from './store.js';

const defaultSettings = {
  requirePunctuation: false,
  restrictSpecial: false,
  hashWordSize: 26,
  bangify: false,
};

class PasswordHasher extends HTMLElement {
  #masterKey;
  #localStore;
  #clearTimeout;

  connectedCallback() {
    this.#localStore = new Store({ keys: Object.keys(defaultSettings) });
    this.#updateDataList();
    this.#setClearTimeout();
    this.#form.masterKey.addEventListener('input', this.#onMasterKeyInput);
    this.#form.masterKey.addEventListener('change', this.#onMasterKeyChange);
    this.#form.addEventListener('submit', this.#onSubmit);
    this.#form.siteTag.addEventListener('change', this.#onSiteTagChange);
    this.#form.siteTag.addEventListener('input', this.#onSiteTagInput);
    this.#form.reset.addEventListener('click', this.#onResetClick);
    this.#form.delete.addEventListener('click', this.#onDeleteClick);
    this.#form.copy.addEventListener('click', this.#onCopyClick);
    this.#form.export.addEventListener('click', this.#onExportClick);
    this.#form.import.addEventListener('click', this.#onImportClick);
    this.querySelector('#importForm').addEventListener(
      'submit',
      this.#onImportSubmit,
    );
    window.addEventListener('focus', () => this.#setClearTimeout());
  }

  get #form() {
    return this.querySelector('#form');
  }

  get #settings() {
    return {
      requirePunctuation: this.#form.elements.requirePunctuation.checked,
      restrictSpecial: this.#form.elements.restrictSpecial.checked,
      hashWordSize: this.#form.elements.hashWordSize.valueAsNumber,
      bangify: this.#form.elements.bangify.checked,
    };
  }

  #onMasterKeyInput = ({ target }) => {
    target.classList.remove('ok', 'danger', 'network');
  };

  #onMasterKeyChange = ({ target }) => {
    target.value = target.value.trim();
    this.#masterKey = target.value;
    target.value = Array(target.value.length).fill('#').join('');
    this.#checkPwnage(this.#masterKey, target);
  };

  #onSubmit = (e) => {
    if (this.#form.checkValidity()) {
      e.preventDefault();
      this.#generate();
    }
  };

  #onSiteTagChange = ({ target }) => {
    target.value = target.value.trim();
    if (!this.#form.checkValidity()) {
      return;
    }
    const { value } = this.#form.siteTag;
    if (this.#localStore.has(value)) {
      this.#generate();
    }
  };

  #onSiteTagInput = () => {
    this.#setSaved();
  };

  #onResetClick = () => {
    this.#updateSettings(defaultSettings);
  };

  #onCopyClick = () => {
    const hash = this.#form.hash;
    navigator.clipboard.writeText(hash.value);
    hash.focus();
    hash.setSelectionRange(0, hash.value.length);
  };

  #onDeleteClick = () => {
    this.#localStore.delete(this.#form.elements.siteTag.value);
    this.#form.elements.delete.hidden = true;
    this.#updateDataList();
  };

  #updateDataList() {
    this.#form.querySelector('#savedSites').replaceChildren(
      ...[...this.#localStore.keys()]
        .map((key) => [key.toLowerCase(), key])
        .sort()
        .map(([, key]) => key)
        .filter(Boolean)
        .map((key) => {
          const option = document.createElement('option');
          option.value = key;
          return option;
        }),
    );
  }

  #setSaved() {
    const value = this.#form.siteTag.value.trim();
    this.#form.hash.value = '';
    this.#form.hash.classList.remove('ok', 'danger', 'network');

    if (this.#localStore.has(value)) {
      const settings = this.#localStore.get(value);
      this.#updateSettings(settings);
      this.querySelector('#details').open = !Object.entries(
        defaultSettings,
      ).every(([key, value]) => settings[key] === value);
      this.#form.elements.delete.hidden = false;
    } else {
      this.#updateSettings(defaultSettings);
      this.querySelector('#details').open = false;
      this.#form.elements.delete.hidden = false;
    }
  }

  async #generate() {
    const siteTag = this.#form.elements.siteTag.value;
    if (this.#masterKey === siteTag) {
      this.#form.elements.siteTag.value = '';
      return;
    }
    const settings = this.#settings;
    const hash = await generateHash({
      masterKey: this.#masterKey,
      siteTag,
      ...settings,
    });
    const { hash: hashInput } = this.#form.elements;
    hashInput.value = hash;
    hashInput.focus();
    hashInput.setSelectionRange(0, hash.length);
    this.#localStore.set(siteTag, settings);
    this.#updateDataList();
    this.#checkPwnage(hash, hashInput);
  }

  async #checkPwnage(value, el) {
    el.classList.remove('ok', 'danger', 'network');

    try {
      const hits = await pwnage(value);
      if (hits > 0) {
        el.classList.add('danger');
        el.title = `Password compromised ${hits} times`;
      } else {
        el.classList.add('ok');
      }
    } catch (error) {
      if (error instanceof Response) {
        console.error(error);
      } else {
        console.log(error);
        el.classList.add('network');
      }
    }
  }

  #updateSettings(settings) {
    this.#form.elements.requirePunctuation.checked =
      settings.requirePunctuation;
    this.#form.elements.restrictSpecial.checked = settings.restrictSpecial;
    this.#form.elements.hashWordSize.value = settings.hashWordSize;
    this.#form.elements.bangify.checked = settings.bangify;
  }

  #setClearTimeout() {
    window.clearTimeout(this.#clearTimeout);
    this.#clearTimeout = window.setTimeout(
      () => {
        this.masterKey = null;
        this.#form.elements.masterKey.value = '';
        this.#form.elements.masterKey.classList.remove(
          'ok',
          'danger',
          'network',
        );
      },
      4 * 60 * 60 * 1000,
    );
  }

  #onExportClick = () => {
    this.querySelector('#exportDialog').showModal();
    this.querySelector('#exportStore').value = JSON.stringify(
      Object.fromEntries(this.#localStore),
      null,
      '  ',
    );
  };

  #onImportClick = () => {
    this.querySelector('#importDialog').showModal();
  };

  #onImportSubmit = ({ target }) => {
    try {
      this.#localStore.import(JSON.parse(target.elements.importStore.value));
      this.#updateDataList();
    } catch (e) {
      e.preventDefault();
      alert(`Invalid data ${e.message}`);
    }
  };
}

customElements.define('password-hasher', PasswordHasher);
