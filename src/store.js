const localStorageKey = 'db329347-75fb-4d26-8f4e-6b887f2f08a9';

export default class extends Map {
  #keys;

  constructor({ keys } = {}) {
    super();
    window.addEventListener('storage', () => this.#load());
    this.#keys = [...keys, 'updated'];
    this.#load();
  }

  set(name, value) {
    const values = {
      ...value,
      updated: new Date().valueOf(),
    };
    const ret = super.set(name, values);
    this.#save();
    return ret;
  }

  delete(name) {
    const ret = super.delete(name);
    this.#save();
    return ret;
  }

  import(data) {
    for (const [key, value] of Object.entries(data)) {
      const updated = this.has(key)
        ? this.get(key)?.updated || Infinity
        : -Infinity;
      if (updated < (data.updated || Date.now())) {
        super.set(key, value);
      }
    }
    this.#save();
  }

  #save() {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(this.#compacted()));
    } catch (e) {
      console.error('error saving data', e);
    }
  }

  #load() {
    try {
      const data = JSON.parse(localStorage.getItem(localStorageKey)) || {
        props: [],
        map: [],
      };
      this.clear();
      this.#inflate(data).forEach(([key, value]) => super.set(key, value));
    } catch (e) {
      console.error('error loading data', e);
    }
  }

  #compacted() {
    const props = [];
    const map = [...this.entries()].map(([name, values]) => {
      const mapped = [];
      for (const [key, value] of Object.entries(values)) {
        if (!this.#keys.includes(key)) {
          continue;
        }
        let index = props.indexOf(key);
        if (index === -1) {
          index = props.push(key) - 1;
        }
        mapped[index] = value;
      }
      return [name, mapped];
    });
    return { props, map };
  }

  #inflate({ props, map }) {
    return map.map(([name, array]) => {
      const mapped = {};
      array.forEach((value, index) => {
        if (value !== null) {
          mapped[props[index]] = value;
        }
      });
      return [name, mapped];
    });
  }
}
