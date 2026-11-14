/**
 * What new documents start from: the built-in templates, and the user's own (documents marked as templates).
 * Offered on the Documents page and in a project's Documents tab.
 */

/**
 * @typedef {{ id: string, name: string, title: string, html: string }} Template
 * @typedef {{ id: string, name: string, html: string, builtIn: boolean }} TemplateChoice
 * @typedef {import('./storage.js').DocumentStore} DocumentStore
 * @typedef {import('./storage.js').NewDocument} NewDocument
 */

/** @type {Template[]} */
export const TEMPLATES = [
  { id: 'blank', name: 'Blank', title: 'Untitled document', html: '<p><br></p>' },
  {
    id: 'letter',
    name: 'Letter',
    title: 'Letter',
    html:
      '<p>Your name<br>Street address<br>City, postcode</p><p>Date</p><p>Recipient name<br>Organisation<br>Street address</p>' +
      '<p>Dear recipient,</p><p>Start your letter here. Say why you are writing in the first paragraph.</p>' +
      '<p>Add the details in the following paragraphs.</p><p>Yours sincerely,</p><p><br></p><p>Your name</p>',
  },
  {
    id: 'meeting',
    name: 'Meeting notes',
    title: 'Meeting notes',
    html:
      '<h1>Meeting notes</h1><p><b>Date:</b> &nbsp;</p><p><b>Attendees:</b> &nbsp;</p>' +
      '<h2>Agenda</h2><ol><li>First topic</li><li>Second topic</li></ol>' +
      '<h2>Notes</h2><p>What was discussed and decided.</p>' +
      '<h2>Action items</h2><ul class="checklist"><li>Task — owner — due date</li><li>Task — owner — due date</li></ul>',
  },
  {
    id: 'resume',
    name: 'Résumé',
    title: 'Résumé',
    html:
      '<h1>Your name</h1><p>Role · email@example.com · phone · city</p>' +
      '<h2>Summary</h2><p>Two or three sentences on who you are and what you are looking for.</p>' +
      '<h2>Experience</h2><h3>Job title — Company</h3><p><i>Start – end</i></p><ul><li>What you achieved</li><li>What you were responsible for</li></ul>' +
      '<h2>Education</h2><h3>Degree — School</h3><p><i>Start – end</i></p>' +
      '<h2>Skills</h2><p>Skill, skill, skill</p>',
  },
  {
    id: 'brief',
    name: 'Project brief',
    title: 'Project brief',
    html:
      '<h1>Project brief</h1><h2>Goal</h2><p>What this project should achieve, in one or two sentences.</p>' +
      '<h2>Background</h2><p>Why it matters now.</p>' +
      '<h2>Scope</h2><table style="width: 100%;"><tbody><tr><td><b>In scope</b></td><td><b>Out of scope</b></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>' +
      '<h2>Milestones</h2><ol><li>Milestone — date</li><li>Milestone — date</li></ol>' +
      '<h2>Risks</h2><ul><li>Risk and how it will be handled</li></ul>',
  },
];

/** The user's own templates and those shared with them, by name. */
export const storedTemplates = (/** @type {DocumentStore} */ store) =>
  store
    .index()
    .filter((d) => d.template)
    .sort((a, b) => a.title.localeCompare(b.title));

/**
 * Every template a document can start from, built-in ones first, with the content of each. A server store
 * has a stored template's content only once it is loaded (see `loadTemplates`).
 * @param {DocumentStore} store
 * @returns {TemplateChoice[]}
 */
export const templateChoices = (store) => [
  ...TEMPLATES.map(({ id, name, html }) => ({ id, name, html, builtIn: true })),
  ...storedTemplates(store).map(({ id, title }) => ({ id, name: title, html: store.read(id), builtIn: false })),
];

/** Makes the content of the stored templates available, for showing them. */
export async function loadTemplates(/** @type {DocumentStore} */ store) {
  if (store.remote) await Promise.all(storedTemplates(store).map((t) => store.load(t.id)));
}

/**
 * What a new document made from the template with this id starts with: its title and content and, for a
 * stored template, its page setup and styles. Unknown ids give a blank document; null means the stored
 * template could not be loaded.
 * @param {DocumentStore} store
 * @param {string} [templateId]
 * @returns {Promise<NewDocument | null>}
 */
export async function fromTemplate(store, templateId) {
  const builtIn = TEMPLATES.find((t) => t.id === templateId);
  if (builtIn) return { title: builtIn.title, html: builtIn.html };
  if (!templateId || !store.meta(templateId)?.template) return {};
  if (!(await store.load(templateId))) return null;
  const { title, snippet, page, styles } = store.meta(templateId);
  return { title, html: store.read(templateId), snippet, page, styles };
}
