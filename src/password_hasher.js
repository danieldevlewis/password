// Features:
// - [ ] Manage saved sites
//   - [ ] List
//   - [ ] Remote save
// - [ ] Review option usage
// - [ ] Refactor
// - [ ] Github hosting

import generateHash from './native_hasher.js';
import pwnage from './pwnage.js';
import LocalStorageStore from './local_storage_store.js';

const defaultSettings = {
  requireDigit: true,
  requirePunctuation: false,
  requireMixedCase: true,
  restrictSpecial: false,
  restrictDigits: false,
  hashWordSize: 26,
  bangify: false,
};

class PasswordHasher extends HTMLElement {
  #masterKey;
  #localStorageStore;
  #clearTimeout;

  connectedCallback() {
    this.#localStorageStore = new LocalStorageStore();
    this.#updateDateList();
    this.#setClearTimeout();
    this.#form.masterKey.addEventListener('input', this.#onMasterKeyInput);
    this.#form.masterKey.addEventListener('change', this.#onMasterKeyChange);
    this.#form.addEventListener('submit', this.#onSubmit);
    this.#form.siteTag.addEventListener('change', this.#onSiteTagChange);
    this.#form.siteTag.addEventListener('input', this.#onSiteTagInput);
    this.#form.reset.addEventListener('click', this.#onResetClick);
    this.#form.delete.addEventListener('click', this.#onDeleteClick);
    this.#form.copy.addEventListener('click', this.#onCopyClick);
    window.addEventListener('focus', () => this.#setClearTimeout());
  }

  get #form() {
    return this.querySelector('form');
  }

  get #settings() {
    return {
      requireDigit: this.#form.elements.requireDigit.checked,
      requirePunctuation: this.#form.elements.requirePunctuation.checked,
      requireMixedCase: this.#form.elements.requireMixedCase.checked,
      restrictSpecial: this.#form.elements.restrictSpecial.checked,
      restrictDigits: this.#form.elements.restrictDigits.checked,
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

  #updateDateList() {
    this.#form.querySelector('#savedSites').replaceChildren(
      ...[...this.#localStorageStore.keys()]
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

  #onSiteTagChange = ({ target }) => {
    target.value = target.value.trim();
    if (!this.#form.checkValidity()) {
      return;
    }
    const { value } = this.#form.siteTag;
    if (this.#localStorageStore.has(value)) {
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
    this.#localStorageStore.delete(this.#form.elements.siteTag.value);
    this.#form.elements.delete.hidden = true;
    this.#updateDateList();
  };

  #setSaved() {
    const value = this.#form.siteTag.value.trim();
    this.#form.hash.value = '';
    this.#form.hash.classList.remove('ok', 'danger', 'network');

    if (this.#localStorageStore.has(value)) {
      const settings = this.#localStorageStore.get(value);
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
    this.#localStorageStore.set(siteTag, settings);
    this.#updateDateList();
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
    this.#form.elements.requireDigit.checked = settings.requireDigit;
    this.#form.elements.requirePunctuation.checked =
      settings.requirePunctuation;
    this.#form.elements.requireMixedCase.checked = settings.requireMixedCase;
    this.#form.elements.restrictSpecial.checked = settings.restrictSpecial;
    this.#form.elements.restrictDigits.checked = settings.restrictDigits;
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
}

customElements.define('password-hasher', PasswordHasher);
