import {describe, expect, test} from 'bun:test';

import {formatSpaces, hasPageRows, labelPageRows, labelStructuredPages, mergeWindows, resolveSpace, type ShellState, type Space, type SpaceOfPage} from '~/spaces';

const WORK: Space = {
  id: 'work-id',
  name: 'Work',
  profile: 'Default',
  active: true,
  tabs: 2,
  sleeping: 0,
};

const HOME: Space = {
  id: 'home-id',
  name: 'Home',
  profile: 'Second',
  active: false,
  tabs: 1,
  sleeping: 3,
};

const SPACE_OF_PAGE: SpaceOfPage = pageId =>
    new Map([[1, WORK], [2, HOME], [3, WORK]]).get(pageId);

const LISTING = [
  'Successfully navigated to https://example.com/.',
  '## Pages',
  '1: Example Domain (https://example.com/) [selected]',
  '2: Inbox (https://mail.example/) isolatedContext=mail',
  '3: 2: a title that starts like a row (https://example.org/)',
  '4: Unknown (https://example.net/)',
  '## Extension Pages',
  '5: Popup (chrome-extension://abc/popup.html)',
].join('\n');

describe('mergeWindows', () => {
  const first: ShellState = {
    spaces: [
      {id: 'work-id', name: 'Work', profile: 'Default', active: true, dormant: 1},
      {id: 'home-id', name: 'Home', profile: 'Second', active: false, dormant: 2},
    ],
    tabs: [
      {targetId: 'A', space: 'work-id'},
      {targetId: 'B', space: 'home-id'},
      {targetId: '', space: 'home-id'},
      {targetId: 'C', space: 'gone-id'},
    ],
  };
  const second: ShellState = {
    spaces: [
      {id: 'work-id', name: 'Work', profile: 'Default', active: false, dormant: 0},
      {id: 'home-id', name: 'Home', profile: 'Second', active: true, dormant: 1},
    ],
    tabs: [{targetId: 'D', space: 'work-id'}],
  };

  test('counts loaded and sleeping tabs across windows', () => {
    const {spaces} = mergeWindows([first, second]);
    expect(spaces).toEqual([
      {id: 'work-id', name: 'Work', profile: 'Default', active: true, tabs: 2, sleeping: 1},
      {id: 'home-id', name: 'Home', profile: 'Second', active: true, tabs: 1, sleeping: 3},
    ]);
  });

  test('maps each loaded tab to its space', () => {
    const {spaceOfTarget} = mergeWindows([first, second]);
    expect([...spaceOfTarget.keys()]).toEqual(['A', 'B', 'D']);
    expect(spaceOfTarget.get('A')?.name).toBe('Work');
    expect(spaceOfTarget.get('B')?.name).toBe('Home');
    expect(spaceOfTarget.get('D')?.name).toBe('Work');
  });

  test('returns nothing without windows', () => {
    const {spaces, spaceOfTarget} = mergeWindows([]);
    expect(spaces).toEqual([]);
    expect(spaceOfTarget.size).toBe(0);
  });
});

describe('resolveSpace', () => {
  test('matches an id exactly', () => {
    expect(resolveSpace([WORK, HOME], 'home-id')).toBe(HOME);
  });

  test('matches a name without regard to case or padding', () => {
    expect(resolveSpace([WORK, HOME], '  wORK ')).toBe(WORK);
  });

  test('prefers an id over a space named like it', () => {
    const named = {...HOME, id: 'other-id', name: 'work-id'};
    expect(resolveSpace([named, WORK], 'work-id')).toBe(WORK);
  });

  test('lists the spaces when nothing matches', () => {
    expect(() => resolveSpace([WORK, HOME], 'pratico'))
        .toThrow(
            'No space matches "pratico". Available spaces:\n' +
            'work-id: Work\nhome-id: Home');
  });

  test('asks for an id when a name is shared', () => {
    const twin = {...HOME, name: 'work'};
    expect(() => resolveSpace([WORK, twin], 'Work'))
        .toThrow(
            'More than one space is named "Work". Use an id:\n' +
            'work-id: Work\nhome-id: work');
  });
});

describe('formatSpaces', () => {
  test('marks the active space and notes sleeping tabs', () => {
    expect(formatSpaces([WORK, HOME])).toBe([
      '## Spaces',
      'work-id: Work [active] profile=Default tabs=2 sleeping=0',
      'home-id: Home profile=Second tabs=1 sleeping=3',
      'Sleeping tabs are not loaded. They are missing from list_pages ' +
          'until they are opened in the browser.',
    ].join('\n'));
  });

  test('leaves the note out when nothing sleeps', () => {
    expect(formatSpaces([WORK])).toBe(
        '## Spaces\nwork-id: Work [active] profile=Default tabs=2 sleeping=0');
  });
});

describe('hasPageRows', () => {
  test('finds the pages heading on its own line', () => {
    expect(hasPageRows(LISTING)).toBe(true);
    expect(hasPageRows('## Pages of a book\n1: one')).toBe(false);
    expect(hasPageRows('1: Example Domain (https://example.com/)')).toBe(false);
  });
});

describe('labelPageRows', () => {
  test('labels the rows under the pages heading only', () => {
    expect(labelPageRows(LISTING, SPACE_OF_PAGE)).toBe([
      'Successfully navigated to https://example.com/.',
      '## Pages',
      '1: Example Domain (https://example.com/) [selected] space=Work',
      '2: Inbox (https://mail.example/) isolatedContext=mail space=Home',
      '3: 2: a title that starts like a row (https://example.org/) space=Work',
      '4: Unknown (https://example.net/)',
      '## Extension Pages',
      '5: Popup (chrome-extension://abc/popup.html)',
    ].join('\n'));
  });

  test('drops the rows of other spaces when filtering', () => {
    expect(labelPageRows(LISTING, SPACE_OF_PAGE, HOME)).toBe([
      'Successfully navigated to https://example.com/.',
      '## Pages',
      '2: Inbox (https://mail.example/) isolatedContext=mail space=Home',
      '## Extension Pages',
      '5: Popup (chrome-extension://abc/popup.html)',
    ].join('\n'));
  });

  test('leaves text without a pages section untouched', () => {
    const text = '## Opened pages\n1: Example Domain (https://example.com/)';
    expect(labelPageRows(text, SPACE_OF_PAGE)).toBe(text);
  });
});

describe('labelStructuredPages', () => {
  const pages = [
    {id: 1, url: 'https://example.com/'},
    {id: 2, url: 'https://mail.example/'},
    {id: 4, url: 'https://example.net/'},
  ];

  test('adds the space and keeps the other fields', () => {
    expect(labelStructuredPages(pages, SPACE_OF_PAGE)).toEqual([
      {id: 1, url: 'https://example.com/', space: 'Work'},
      {id: 2, url: 'https://mail.example/', space: 'Home'},
      {id: 4, url: 'https://example.net/'},
    ]);
  });

  test('drops the pages of other spaces when filtering', () => {
    expect(labelStructuredPages(pages, SPACE_OF_PAGE, WORK)).toEqual([
      {id: 1, url: 'https://example.com/', space: 'Work'},
    ]);
  });
});
