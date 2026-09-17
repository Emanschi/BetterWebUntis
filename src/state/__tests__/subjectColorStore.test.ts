// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useSubjectColorStore } from '../subjectColorStore';

const STORAGE_KEY = 'bwu-subject-colors';

beforeEach(() => {
  localStorage.clear();
  useSubjectColorStore.setState({ overrides: {} });
});

describe('subjectColorStore', () => {
  it('startet ohne Overrides', () => {
    expect(useSubjectColorStore.getState().overrides).toEqual({});
  });

  it('setOverride setzt die Farbe im State und in localStorage', () => {
    useSubjectColorStore.getState().setOverride(5, '#ff0000');

    expect(useSubjectColorStore.getState().overrides[5]).toBe('#ff0000');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ '5': '#ff0000' });
  });

  it('ueberschreibt eine vorhandene Farbe fuer dasselbe Fach', () => {
    useSubjectColorStore.getState().setOverride(5, '#ff0000');
    useSubjectColorStore.getState().setOverride(5, '#00ff00');

    expect(useSubjectColorStore.getState().overrides[5]).toBe('#00ff00');
  });

  it('clearOverride entfernt nur die eine Farbe, andere bleiben', () => {
    useSubjectColorStore.getState().setOverride(5, '#ff0000');
    useSubjectColorStore.getState().setOverride(6, '#00ff00');

    useSubjectColorStore.getState().clearOverride(5);

    expect(useSubjectColorStore.getState().overrides).toEqual({ 6: '#00ff00' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ '6': '#00ff00' });
  });

  it('clearOverride fuer ein nicht gesetztes Fach aendert nichts', () => {
    useSubjectColorStore.getState().setOverride(5, '#ff0000');
    useSubjectColorStore.getState().clearOverride(999);

    expect(useSubjectColorStore.getState().overrides).toEqual({ 5: '#ff0000' });
  });
});
