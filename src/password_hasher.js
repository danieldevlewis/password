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
  #mask;
  #localStore;
  #clearTimeout;

  connectedCallback() {
    this.#localStore = new Store({ keys: Object.keys(defaultSettings) });
    this.#updateDataList();
    this.#setClearTimeout();
    this.#id('masterKey').addEventListener('focus', this.#onMasterKeyFocus);
    this.#id('masterKey').addEventListener(
      'beforeinput',
      this.#onMasterKeyBeforeInput,
    );
    this.#id('masterKey').addEventListener('change', this.#onMasterKeyChange);
    this.#id('form').addEventListener('submit', this.#onSubmit);
    this.#id('siteTag').addEventListener('change', this.#onSiteTagChange);
    this.#id('siteTag').addEventListener('input', this.#onSiteTagInput);
    this.#id('reset').addEventListener('click', this.#onResetClick);
    this.#id('delete').addEventListener('click', this.#onDeleteClick);
    this.#id('copy').addEventListener('click', this.#onCopyClick);
    this.#id('export').addEventListener('click', this.#onExportClick);
    this.#id('import').addEventListener('click', this.#onImportClick);
    this.#id('importForm').addEventListener('submit', this.#onImportSubmit);
    window.addEventListener('focus', () => this.#setClearTimeout());
  }

  #id(id) {
    return this.querySelector(`#${CSS.escape(id)}`);
  }

  get #settings() {
    return {
      requirePunctuation: this.#id('requirePunctuation').checked,
      restrictSpecial: this.#id('restrictSpecial').checked,
      hashWordSize: this.#id('hashWordSize').valueAsNumber,
      bangify: this.#id('bangify').checked,
    };
  }

  #onMasterKeyFocus = ({ target }) => {
    this.#masterKey = '';
    this.#mask = [];
    this.#id('hash').value = '';
    target.value = '';
    target.classList.remove('ok', 'danger', 'network');
  };

  #onMasterKeyBeforeInput = (e) => {
    // If iOS gets a whiff of a password field it insists
    // on trying to save everything to passwords
    // which breaks the datalist UI on the site tag
    // Therefore simulate a password field
    const {
      data,
      inputType,
      target,
      target: { selectionStart, selectionEnd },
    } = e;
    const editId = crypto.randomUUID();
    switch (inputType) {
      case 'insertText':
      case 'insertFromPaste':
        this.#masterKey =
          this.#masterKey.slice(0, selectionStart) +
          data +
          this.#masterKey.slice(selectionEnd);
        this.#mask.splice(
          selectionStart,
          0,
          ...Array(data.length).fill(editId),
        );
        break;
      case 'deleteContentBackward':
        if (selectionStart === selectionEnd) {
          this.#masterKey =
            this.#masterKey.slice(0, selectionStart - 1) +
            this.#masterKey.slice(selectionStart);
          this.#mask.splice(selectionStart - 1, 1);
        } else {
          this.#masterKey =
            this.#masterKey.slice(0, selectionStart) +
            this.#masterKey.slice(selectionEnd);
          this.#mask.splice(selectionStart, selectionEnd - selectionStart);
        }
        break;
      case 'deleteContentForward':
        if (selectionStart === selectionEnd) {
          this.#masterKey =
            this.#masterKey.slice(0, selectionStart) +
            this.#masterKey.slice(selectionStart + 1);
          this.#mask.splice(selectionStart + 1, 1);
        } else {
          this.#masterKey =
            this.#masterKey.slice(0, selectionStart) +
            this.#masterKey.slice(selectionEnd);
          this.#mask.splice(selectionStart, selectionEnd - selectionStart);
        }
        break;
      case 'deleteContent':
        this.#masterKey =
          this.#masterKey.slice(0, selectionStart) +
          this.#masterKey.slice(selectionEnd);
        this.#mask.splice(selectionStart, selectionEnd - selectionStart);
        break;
    }

    setTimeout(() => {
      const { selectionStart, selectionEnd, selectionDirection } = target;
      target.value = target.value
        .split('')
        .map((c, i) => (this.#mask[i] === editId ? '•' : c))
        .join('');
      target.setSelectionRange(
        selectionStart,
        selectionEnd,
        selectionDirection,
      );
    }, 500);
  };

  #onMasterKeyChange = ({ target }) => {
    target.value = Array(target.value.length).fill('•').join('');
    this.#masterKey = this.#masterKey.trim();
    this.#checkPwnage(this.#masterKey, target);
  };

  #onSubmit = (e) => {
    if (e.target.checkValidity()) {
      e.preventDefault();
      this.#generate();
    }
  };

  #onSiteTagChange = ({ target }) => {
    target.value = target.value.trim();
    if (!target.form.checkValidity()) {
      return;
    }
    const { value } = this.#id('siteTag');
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
    const hash = this.#id('hash');
    navigator.clipboard.writeText(hash.value);
    hash.focus();
    hash.setSelectionRange(0, hash.value.length);
  };

  #onDeleteClick = () => {
    this.#localStore.delete(this.#id('siteTag').value);
    this.#id('delete').hidden = true;
    this.#updateDataList();
  };

  #updateDataList() {
    this.#id('savedSites').replaceChildren(
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
    const value = this.#id('siteTag').value.trim();
    this.#id('hash').value = '';
    this.#id('hash').classList.remove('ok', 'danger', 'network');

    if (this.#localStore.has(value)) {
      const settings = this.#localStore.get(value);
      this.#updateSettings(settings);
      this.querySelector('#details').open = !Object.entries(
        defaultSettings,
      ).every(([key, value]) => settings[key] === value);
      this.#id('delete').hidden = false;
    } else {
      this.#updateSettings(defaultSettings);
      this.querySelector('#details').open = false;
      this.#id('delete').hidden = false;
    }
  }

  async #generate() {
    const siteTag = this.#id('siteTag').value;
    if (this.#masterKey === siteTag) {
      this.#id('siteTag').value = '';
      return;
    }
    const settings = this.#settings;
    const hash = await generateHash({
      masterKey: this.#masterKey,
      siteTag,
      ...settings,
    });
    const hashInput = this.#id('hash');
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
    this.#id('requirePunctuation').checked = settings.requirePunctuation;
    this.#id('restrictSpecial').checked = settings.restrictSpecial;
    this.#id('hashWordSize').value = settings.hashWordSize;
    this.#id('bangify').checked = settings.bangify;
  }

  #setClearTimeout() {
    window.clearTimeout(this.#clearTimeout);
    this.#clearTimeout = window.setTimeout(
      () => {
        this.masterKey = null;
        this.#id('masterKey').value = '';
        this.#id('masterKey').classList.remove('ok', 'danger', 'network');
        this.#id('hash').value = '';
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
