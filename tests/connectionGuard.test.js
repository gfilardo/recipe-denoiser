import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionConnectionGuard, ConnectionOutputError } from '../src/connectionGuard.js';

const choices = { ing_1: ['', 'flour'], ing_2: ['', 'water'], step_2: ['', 'use'] };
const guard = () => createActionConnectionGuard(choices);
const rejects = (text, pattern) => assert.throws(() => guard()(text), error => {
  assert.ok(error instanceof ConnectionOutputError);
  if (pattern) assert.match(error.message, pattern);
  return true;
});

test('fixed connection choices survive every chunk boundary and character-split chunks', () => {
  const text = ' \n { "ing_1" : "flour", "ing_2" : "", "step_2" : "use" } \r\n';
  for (let i = 0; i <= text.length; i++) {
    const g = guard();
    g(text.slice(0, i));
    g(text.slice(i));
  }
  const g = guard();
  for (const char of text) g(char);
});

test('all supplied keys are accepted in any order and empty values mean unselected', () => {
  guard()('{"step_2":"","ing_2":"water","ing_1":""}');
  guard()('{"ing_1":"","ing_2":"","step_2":""}');
  createActionConnectionGuard({})(' \n {} \t ');
});

test('escaped keys and values work in single-character chunks at the maximum content budget', () => {
  const escaped = value => '"' + value.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '"';
  const text = '{' + Object.entries(choices).map(([key, values]) => `${escaped(key)}:${escaped(values[1])}`).join(',') + '}';
  const g = guard();
  for (const char of text) g(char);
  const specialChoices = { 'quote"': ['back\\slash'], 'slash/': ['line\nbreak'], emoji: ['🍕'] };
  const specialText = JSON.stringify(Object.fromEntries(Object.entries(specialChoices).map(([key, values]) => [key, values[0]])));
  const special = createActionConnectionGuard(specialChoices);
  for (const char of specialText) special(char);
});

test('duplicate keys stop at the closing key quote regardless of later values', () => {
  for (const repeatedValue of ['flour', '', 'water']) {
    rejects(`{"ing_1":"flour","ing_1":"${repeatedValue}"}`, /Duplicate connection choice: ing_1/);
  }
  rejects('{"ing_1":"flour","ing_1"', /Duplicate connection choice: ing_1/);
  const g = guard();
  for (const char of '{"ing_1":"flour","ing_\\u0031') g(char);
  assert.throws(() => g('"'), ConnectionOutputError);
});

test('unknown and excluded self or forward keys stop at their closing quote', () => {
  for (const id of ['ing_9', 'step_1', 'step_3', 'input_ids', '__proto__']) {
    rejects(`{"${id}"`, /Unknown connection choice/);
  }
});

test('missing required candidate keys fail at the final brace', () => {
  rejects('{}', /Missing connection choices: ing_1, ing_2, step_2/);
  rejects('{"ing_1":"flour"}', /Missing connection choices: ing_2, step_2/);
  rejects('{"ing_1":"flour","ing_2":"water"}', /Missing connection choices: step_2/);
});

test('invalid choice values fail at their closing quote before the object ends', () => {
  rejects('{"ing_1":"use"', /Invalid selection for ing_1/);
  rejects('{"ing_1":"water"', /Invalid selection for ing_1/);
  rejects('{"step_2":"flour"', /Invalid selection for step_2/);
  rejects('{"ing_1":"flour flour"', /Invalid selection for ing_1/);
});

test('nested arrays and objects, non-string values, and trailing commas are invalid', () => {
  for (const text of [
    '{"ing_1":[', '{"ing_1":{', '{"ing_1":1', '{"ing_1":null',
    '{"ing_1":"flour",}', '{"ing_1":"flour","ing_2":"","step_2":"",}',
  ]) rejects(text);
});

test('non-JSON shapes, extra fields, missing punctuation and trailing content are invalid', () => {
  for (const text of [
    '```json', '[', 'null', '{"ing_1" "flour"', '{"ing_1":"flour" "ing_2"',
    '{"ing_1":"flour","ing_2":"","step_2":"","extra"',
    '{"ing_1":"flour","ing_2":"","step_2":""}more',
    '{"ing_1":"flour","ing_2":"","step_2":""}{', '\u00a0{',
  ]) rejects(text);
});

test('invalid string escapes and raw control characters fail with a typed error', () => {
  for (const text of [
    '{"ing_\\x', '{"ing_1":"flour\\u00xz', '{"ing_1":"flour\n',
  ]) rejects(text);
});

test('the choice-derived budget bounds unfinished strings without charging formatting whitespace', () => {
  rejects('{"ing_1":"' + 'x'.repeat(2000), /content budget/);
  rejects('{"' + 'x'.repeat(2000), /content budget/);
  guard()(' '.repeat(2000) + '{"ing_1":"flour","ing_2":"","step_2":""}' + '\n'.repeat(2000));
});

test('valid incomplete prefixes remain incomplete for the final JSON parser', () => {
  const text = '{"ing_1":"flour","ing_2":"","step_2":"use"}';
  for (let i = 0; i < text.length; i++) {
    const prefix = text.slice(0, i);
    assert.doesNotThrow(() => guard()(prefix));
    assert.throws(() => JSON.parse(prefix), SyntaxError);
  }
});
