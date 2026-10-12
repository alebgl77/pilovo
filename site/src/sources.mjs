// Extracts the website's generated content from the repository's Markdown (single source of truth).
// Every extraction asserts its expected shape, so documentation drift fails the build.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVIEWED, formatDate } from './config.mjs';
import { assertSupported, parse, section, slug, stripInline } from './markdown.mjs';

function expect(condition, message) {
  if (!condition) throw new Error(`Source check failed: ${message}`);
}
const paragraphs = blocks => blocks.filter(block => block.type === 'paragraph');

export function readme(repoRoot, c) {
  const file = c.readme;
  const blocks = parse(readFileSync(path.join(repoRoot, file), 'utf8'));
  const all = paragraphs(blocks);
  const definitionIndex = all.findIndex(p => p.text.startsWith(c.what.definitionPrefix));
  expect(definitionIndex >= 0 && definitionIndex <= 2, `${file}: definition paragraph starting "${c.what.definitionPrefix}"`);
  const definition = all[definitionIndex].text;
  const version = all[definitionIndex + 1].text;
  expect(version.startsWith(c.what.versionPrefix), `${file}: version paragraph starting "${c.what.versionPrefix}"`);

  const factsBlocks = section(blocks, c.what.factsHeading, 2);
  expect(factsBlocks[0]?.type === 'paragraph' && factsBlocks[1]?.type === 'table', `${file}: facts paragraph then table`);
  assertSupported(factsBlocks.slice(0, 2), `${file} facts`);
  const factsIntro = factsBlocks[0].text;
  expect(factsIntro.startsWith(c.what.factsPrefix), `${file}: facts intro prefix`);
  expect(factsIntro.includes(c.what.factsDate) && c.what.factsDate === formatDate(REVIEWED, c.lang), `${file}: facts review date equals REVIEWED`);
  const facts = factsBlocks[1].rows;
  expect(facts.length === 9, `${file}: 9 facts rows (found ${facts.length})`);
  facts.forEach((row, i) => expect(row[0] === c.what.labels[i], `${file}: facts row ${i} label "${c.what.labels[i]}" (found "${row[0]}")`));

  const stateBlocks = section(blocks, c.states.heading, 3);
  expect(stateBlocks[0]?.type === 'paragraph' && stateBlocks[1]?.type === 'table' && stateBlocks[2]?.type === 'paragraph', `${file}: states paragraph, table, paragraph`);
  assertSupported(stateBlocks.slice(0, 3), `${file} states`);
  expect(stateBlocks[0].text.startsWith(c.states.contextPrefix), `${file}: states context prefix`);
  expect(stateBlocks[2].text.startsWith(c.states.notePrefix), `${file}: states note prefix`);
  const states = stateBlocks[1].rows;
  expect(states.length === 6, `${file}: 6 state rows (found ${states.length})`);
  states.forEach((row, i) => expect(row[0] === c.states.rows[i], `${file}: state row ${i} "${c.states.rows[i]}" (found "${row[0]}")`));

  const faqBlocks = section(blocks, c.faq.heading, 2);
  const last = faqBlocks.at(-1);
  expect(last?.type === 'paragraph' && last.text.startsWith(c.faq.trailingPrefix), `${file}: FAQ ends with the "${c.faq.trailingPrefix}" line`);
  const faqRange = faqBlocks.slice(0, -1);
  assertSupported(faqRange, `${file} FAQ`);
  const faq = [];
  for (const block of faqRange) {
    if (block.type === 'heading') {
      expect(block.level === 3, `${file}: only ### questions in the FAQ section`);
      faq.push({ question: block.text, paragraphs: [] });
    } else {
      expect(block.type === 'paragraph' && faq.length, `${file}: FAQ answers are paragraphs under a question`);
      faq.at(-1).paragraphs.push(block.text);
    }
  }
  expect(faq.length === 9, `${file}: 9 FAQ items (found ${faq.length})`);
  return { file, definition, version, factsIntro, facts, stateContext: stateBlocks[0].text, states, stateNote: stateBlocks[2].text, faq };
}

export function faqDoc(repoRoot, c) {
  const file = c.faqFile;
  const text = readFileSync(path.join(repoRoot, file), 'utf8');
  const blocks = assertSupported(parse(text), file);
  const seen = new Set();
  for (const block of blocks) if (block.type === 'heading') block.id = slug(block.text, seen);
  expect(blocks[0]?.type === 'heading' && blocks[0].level === 1, `${file}: starts with a # title`);
  const title = blocks[0].text;
  const nav = blocks[1];
  expect(nav?.type === 'paragraph' && nav.text.includes('·') && /^(?:\[[^\]]+\]\([^)]+\)|[\p{L} ]+)(?:\s·\s(?:\[[^\]]+\]\([^)]+\)|[\p{L} ]+))+$/u.test(nav.text), `${file}: language navigation line`);
  const intro = blocks[2];
  const date = formatDate(REVIEWED, c.lang);
  expect(intro?.type === 'paragraph' && intro.text.includes(`${c.faqPage.reviewedPrefix}${date}.`), `${file}: intro with "${c.faqPage.reviewedPrefix}${date}."`);
  const chapters = [];
  for (const block of blocks.slice(3)) {
    if (block.type === 'heading' && block.level === 2) chapters.push({ title: block.text, id: block.id, questions: [] });
    else if (block.type === 'heading' && block.level === 3) {
      expect(chapters.length, `${file}: question before any chapter`);
      chapters.at(-1).questions.push({ question: block.text, id: block.id, paragraphs: [] });
    } else if (block.type === 'paragraph') {
      expect(chapters.at(-1)?.questions.length, `${file}: paragraph outside a question at line ${block.line}`);
      chapters.at(-1).questions.at(-1).paragraphs.push(block.text);
    } else throw new Error(`Source check failed: ${file}: unexpected block at line ${block.line}`);
  }
  const questionCount = (text.match(/^### /gm) || []).length;
  expect(chapters.length === 7, `${file}: 7 chapters (found ${chapters.length})`);
  const total = chapters.reduce((n, chapter) => n + chapter.questions.length, 0);
  expect(total === questionCount, `${file}: ${questionCount} questions rendered (found ${total})`);
  chapters.forEach(chapter => chapter.questions.forEach(q => expect(q.paragraphs.length, `${file}: answer for "${q.question}"`)));
  return { file, title, intro: intro.text, chapters, questionCount, ids: new Set(blocks.filter(b => b.type === 'heading').map(b => b.id)) };
}

// Each README FAQ question must also be a ### heading of the matching FAQ file.
export function assertReadmeFaqInFaq(readmeData, faqData) {
  const questions = new Set(faqData.chapters.flatMap(chapter => chapter.questions.map(q => stripInline(q.question))));
  for (const item of readmeData.faq) expect(questions.has(stripInline(item.question)), `${readmeData.file} question missing from ${faqData.file}: ${item.question}`);
}
