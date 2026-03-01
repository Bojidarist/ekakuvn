export class UndoManager {
	#undoStack = []
	#redoStack = []
	#maxHistory = 50

	pushUndo(projectSnapshot) {
		this.#undoStack.push(projectSnapshot)
		if (this.#undoStack.length > this.#maxHistory) {
			this.#undoStack.shift()
		}
		this.#redoStack = []
	}

	undo(currentProject) {
		if (this.#undoStack.length === 0) return null

		this.#redoStack.push(structuredClone(currentProject))
		return this.#undoStack.pop()
	}

	redo(currentProject) {
		if (this.#redoStack.length === 0) return null

		this.#undoStack.push(structuredClone(currentProject))
		return this.#redoStack.pop()
	}

	get canUndo() {
		return this.#undoStack.length > 0
	}

	get canRedo() {
		return this.#redoStack.length > 0
	}

	reset() {
		this.#undoStack = []
		this.#redoStack = []
	}
}
