const localStorageKey = 'db329347-75fb-4d26-8f4e-6b887f2f08a9';

export default class extends Map {
  constructor() {
    super();
    window.addEventListener('storage', () => this.#load());
    this.#load();
  }

  set(name, value) {
    const ret = super.set(name, value);
    this.#save();
    return ret;
  }

  delete(name) {
    const ret = super.delete(name);
    this.#save();
    return ret;
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

  #save() {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(this.#compacted()));
    } catch (e) {
      console.error('error saving data', e);
    }
  }

  #compacted() {
    const props = [];
    const map = [...this.entries()].map(([name, values]) => {
      const mapped = [];
      for (const [key, value] of Object.entries(values)) {
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
