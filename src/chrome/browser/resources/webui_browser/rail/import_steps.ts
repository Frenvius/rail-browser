import type {ImportCounts, ImportLocked, ImportProfile} from '../rail_import.mojom-webui.js';
import {ImportStep} from '../rail_import.mojom-webui.js';

export type StepIcon =
    'key'|'clock'|'cookie'|'puzzle'|'star'|'pin'|'grid'|'bookmark';

export interface StepInfo {
  label: string;
  noun: string;
  icon: StepIcon;
}

export const STEP_ORDER: ImportStep[] = [
  ImportStep.kPasswords,
  ImportStep.kHistory,
  ImportStep.kCookies,
  ImportStep.kExtensions,
  ImportStep.kFavorites,
  ImportStep.kPinned,
  ImportStep.kSpaces,
  ImportStep.kBookmarks,
];

export const STEP_INFO: Record<ImportStep, StepInfo> = {
  [ImportStep.kPasswords]: {label: 'Passwords', noun: 'password', icon: 'key'},
  [ImportStep.kHistory]: {label: 'History', noun: 'page', icon: 'clock'},
  [ImportStep.kCookies]: {label: 'Cookies', noun: 'cookie', icon: 'cookie'},
  [ImportStep.kExtensions]:
      {label: 'Extensions', noun: 'extension', icon: 'puzzle'},
  [ImportStep.kFavorites]: {label: 'Favorites', noun: 'favorite', icon: 'star'},
  [ImportStep.kPinned]: {label: 'Pinned Tabs', noun: 'pinned tab', icon: 'pin'},
  [ImportStep.kSpaces]: {label: 'Spaces', noun: 'space', icon: 'grid'},
  [ImportStep.kBookmarks]:
      {label: 'Bookmarks', noun: 'bookmark', icon: 'bookmark'},
};

export function countFor(counts: ImportCounts, step: ImportStep): number {
  switch (step) {
    case ImportStep.kPasswords:
      return counts.passwords;
    case ImportStep.kHistory:
      return counts.history;
    case ImportStep.kCookies:
      return counts.cookies;
    case ImportStep.kExtensions:
      return counts.extensions;
    case ImportStep.kFavorites:
      return counts.favorites;
    case ImportStep.kPinned:
      return counts.pins;
    case ImportStep.kSpaces:
      return counts.spaces;
    case ImportStep.kBookmarks:
      return counts.bookmarks;
  }
}

export function lockedFor(locked: ImportLocked, step: ImportStep): number {
  switch (step) {
    case ImportStep.kPasswords:
      return locked.passwords;
    case ImportStep.kCookies:
      return locked.cookies;
    default:
      return 0;
  }
}

export function applicableSteps(profiles: ImportProfile[]): ImportStep[] {
  return STEP_ORDER.filter(
      step => profiles.some(
          profile => countFor(profile.counts, step) > 0 ||
              lockedFor(profile.locked, step) > 0));
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function hasData(counts: ImportCounts): boolean {
  return STEP_ORDER.some(step => countFor(counts, step) > 0);
}

export function describeCounts(counts: ImportCounts): string {
  const parts = STEP_ORDER.filter(step => countFor(counts, step) > 0)
                    .map(
                        step => pluralize(
                            countFor(counts, step), STEP_INFO[step].noun));
  return parts.length > 0 ? parts.join(', ') : 'Nothing to import';
}
