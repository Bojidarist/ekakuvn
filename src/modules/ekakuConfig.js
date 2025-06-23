export class EkakuConfig {
    #config = {};
    constructor(storageKey = "ekakuConfig") {
        this.storageKey = storageKey;
        this.#load();
    }

    #load() {
        try {
            this.#config = JSON.parse(localStorage.getItem(this.storageKey)) || {};
        } catch {
            this.#config = {};
        }
    }

    #save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.#config));
    }

    set(k, v) {
        this.#config[k] = v;
        this.#save();
    }

    get(k) {
        return this.#config[k];
    }

    getAll() {
        // return { ...this.#config };
        return { ...this.#config };
    }

    remove(k) {
        delete this.#config[k];
        this.#save();
    }

    clear() {
        this.#config = {};
        localStorage.removeItem(this.storageKey);
    }
}
