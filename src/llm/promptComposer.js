import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const templates = JSON.parse(
  readFileSync(join(__dirname, '../../prompts/templates.json'), 'utf-8')
);

/**
 * @param {'resume_tailoring'|'cover_letter'|'form_qa'|'missing_info'} key
 * @param {Record<string, unknown>} variables
 */
export function composePrompt(key, variables) {
  const template = templates[key];
  if (!template) {
    throw new Error(`Prompt template bulunamadı: ${key}`);
  }
  return Object.entries(variables).reduce((acc, [name, value]) => {
    const placeholder = `{{${name}}}`;
    return acc.replaceAll(placeholder, serializeValue(value));
  }, template.prompt);
}

function serializeValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function listPrompts() {
  return templates;
}
