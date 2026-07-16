import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const canvasSource = await readFile(new URL('./Canvas.vue', import.meta.url), 'utf8')
const saveSource = await readFile(new URL('../components/canvas/SaveWorkflowDialog.vue', import.meta.url), 'utf8')

assert.match(canvasSource, /const projectId = route\.query\.projectId \? String\(route\.query\.projectId\) : ['"]['"]/, 'Canvas should read the project id from the route')
assert.match(canvasSource, /!loadWorkflowId && !projectId/, 'Canvas should skip restoring an unrelated session for a project entry')
assert.match(canvasSource, /canvasStore\.workflowMeta = \{ project_id: projectId \}/, 'Canvas should retain the target project for a new workflow')
assert.match(saveSource, /project_id: selectedProjectId\.value \|\| canvasStore\.workflowMeta\?\.project_id/, 'Save dialog should preserve the selected project id')
assert.match(saveSource, /project_id: dataToSave\.project_id \|\| savedWorkflow\.project_id/, 'Save dialog should retain the project id after saving')

console.log('Canvas project context source tests passed')
