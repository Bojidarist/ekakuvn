import { EkakuConfig } from '../ekakuConfig.js'
import { migrateProject } from './projectMigration.js'

export class ProjectPersistence {
	#config = null

	constructor() {
		this.#config = new EkakuConfig('ekaku-editor')
	}

	autoSave(project) {
		this.#config.set('project', project)
	}

	tryRestore() {
		const saved = this.#config.get('project')
		if (!saved) return null

		try {
			migrateProject(saved)
			return saved
		} catch {
			return null
		}
	}
}
