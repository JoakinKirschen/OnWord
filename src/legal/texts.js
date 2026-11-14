/** The privacy policy and the terms of use, as markup; who runs the site is filled in from its settings. */

import { esc } from '../core/html.js';

/** When these texts last changed in substance; shown on both pages. */
export const UPDATED = '14 November 2026';

/**
 * @typedef {{ owner?: string, contact?: string }} SiteOwner who runs this site and how to reach them, from
 *   config.php; empty when the site runs without its server part
 */

/** "Jane Doe (jane@example.com)", or a description when the settings do not say. */
function operator(/** @type {SiteOwner} */ site) {
  const name = site.owner ? esc(site.owner) : 'the site’s operator';
  const mail = site.contact?.includes('@') ? ` (<a href="mailto:${esc(site.contact)}">${esc(site.contact)}</a>)` : '';
  return name + mail;
}

const section = (/** @type {string} */ title, /** @type {string[]} */ paragraphs) =>
  `<h2>${title}</h2>${paragraphs.map((p) => `<p>${p}</p>`).join('')}`;

/** @param {SiteOwner} site */
export function privacyHtml(site) {
  return `<h1>Privacy policy</h1><p class="legal-updated">Last updated ${UPDATED}</p>
    ${section('Who is responsible', [
      `This website runs OnWord, a word processor for documents and building specifications. It is run by ${operator(site)}, who is responsible for the personal data described here. Contact them with any question about it.`,
    ])}
    ${section('What is stored', [
      '<b>Your account:</b> your name and email address, and your password as a one-way hash (the password itself is never stored). If you sign in with Microsoft or Google instead, the site receives your name, your email address and an identifier for your account there, nothing else: it cannot read your mail, files or contacts.',
      '<b>What you make:</b> your documents and their earlier versions (at most ten per document), specifications, prices, contractors’ offers you import, and site reviews with their photos.',
      '<b>Signing in:</b> one cookie keeps you signed in while you use the site; it is needed for the site to work and is not used for anything else. Failed attempts to sign in or to create an account are kept with the IP address they came from for at most one hour, to stop people from guessing passwords.',
    ])}
    ${section('What is not done with it', [
      'There is no advertising, no tracking, no analytics and no third-party scripts, and your data is not sold or passed on. Your documents and projects are visible to you and to the people you share them with; master specifications can be read by everyone with an account on this site.',
      'When you use “Read with AI” to import a contractor’s offer (where the site has it switched on), that file and the project’s article list are sent to Anthropic, which reads it and sends the result back. Nothing else is sent there. An image in a document that links to another website is loaded from that website when the document is shown.',
    ])}
    ${section('Where and how long', [
      'Everything is stored on the server that hosts this website. It is kept until you delete it; deleting a document, specification or review removes it at once. To have your account and everything in it removed, ask the person who runs the site.',
    ])}
    ${section('Your rights', [
      'You may see, correct, download and have removed the personal data held about you, and object to its use. “Back up” in the document list downloads all your documents. For anything else, contact the person who runs this site. You may also complain to your country’s data protection authority.',
    ])}`;
}

/** @param {SiteOwner} site */
export function termsHtml(site) {
  return `<h1>Terms of use</h1><p class="legal-updated">Last updated ${UPDATED}</p>
    ${section('The service', [
      `This website, run by ${operator(site)}, lets you write documents and building specifications, compare offers and record site reviews. By creating an account or signing in, you accept these terms.`,
    ])}
    ${section('Your account', [
      'Keep your password to yourself, or sign in with your work account where the site offers it. You are responsible for what is done with your account. Accounts may be limited to people the site’s operator allows, for example colleagues.',
    ])}
    ${section('Your content', [
      'What you write and upload remains yours. You allow the site to store it and to show it to you and to the people you share it with, and nothing more. Do not upload anything you have no right to, or anything unlawful.',
    ])}
    ${section('Fair use', [
      'Do not try to get into other people’s accounts or documents, overload or attack the site, or use it to send spam. Accounts that do may be suspended or removed.',
    ])}
    ${section('No guarantees', [
      'The site is offered as it is. It is looked after with care, but it may sometimes be unavailable, and data can be lost: keep your own copies of important work (“Back up” and the download options help). As far as the law allows, the operator is not liable for indirect damage or lost data.',
    ])}
    ${section('Changes', [
      'These terms may change; the date above shows when they last did. The privacy policy explains what happens to your personal data.',
    ])}`;
}
