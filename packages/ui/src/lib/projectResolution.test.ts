import { describe, expect, test } from 'bun:test';
import {
  resolveProjectForSessionDirectory,
  resolveProjectLabelForDirectory,
} from './projectResolution';
import { useSpacesStore } from './spaces/spaces-store';

const projects = [
  { id: 'openchamber', path: '/workspace/openchamber', label: 'OpenChamber' },
];

describe('resolveProjectForSessionDirectory', () => {
  test('resolves descendants of Unix and Windows drive root projects', () => {
    const roots = [{ id: 'unix', path: '/' }, { id: 'drive', path: 'C:/' }];
    expect(resolveProjectForSessionDirectory(roots, new Map(), '/workspace/project')?.id).toBe('unix');
    expect(resolveProjectForSessionDirectory(roots, new Map(), 'c:\\Users\\Developer\\Project')?.id).toBe('drive');
    expect(resolveProjectForSessionDirectory(roots, new Map(), 'D:/Project')).toBeNull();
  });

  test('resolves a sibling worktree to its registered project', () => {
    const worktrees = new Map([
      ['/workspace/openchamber', [{
        path: '/workspace/openchamber-feature',
        projectDirectory: '/workspace/openchamber',
        branch: 'feature',
        label: 'feature',
      }]],
    ]);

    expect(resolveProjectForSessionDirectory(projects, worktrees, '/workspace/openchamber-feature')).toEqual(projects[0]);
  });

  test('prefers registered worktree ownership over a containing project', () => {
    const configuredProjects = [
      { id: 'home', path: '/Users/elfy', label: 'Home' },
      { id: 'infoscan', path: '/Users/elfy/GitRepos/infoscan', label: 'InfoScan' },
    ];
    const worktreePath = '/Users/elfy/.local/share/opencode/worktree/refactor-self-hosted-runners';
    const worktrees = new Map([
      ['/Users/elfy/GitRepos/infoscan', [{
        path: worktreePath,
        projectDirectory: '/Users/elfy/GitRepos/infoscan',
        branch: 'refactor/self-hosted-runners',
        label: 'refactor/self-hosted-runners',
      }]],
    ]);

    expect(resolveProjectForSessionDirectory(configuredProjects, worktrees, worktreePath)).toEqual(configuredProjects[1]);
  });

  test('resolves a session in an isolated space to the project the space was made from', () => {
    const space = '0123456789ab';
    const initial = useSpacesStore.getState();
    try {
      // Unknown space: no project, rather than a guess from the path.
      expect(resolveProjectForSessionDirectory(projects, new Map(), `/spaces/${space}/openchamber/src`)).toBeNull();
      useSpacesStore.setState({ spaces: new Map([[space, { id: space, name: 'quick-falcon', state: 'complete', projectDirectory: '/workspace/openchamber', directory: `/spaces/${space}/openchamber` }]]) });
      expect(resolveProjectForSessionDirectory(projects, new Map(), `/spaces/${space}/openchamber/src`)).toEqual(projects[0]);
    } finally {
      useSpacesStore.setState(initial, true);
    }
  });
});

describe('resolveProjectLabelForDirectory', () => {
  const configuredProjects = [
    { id: 'alpha', path: '/workspace/alpha', label: 'alpha' },
    { id: 'beta', path: '/workspace/beta', label: 'beta' },
  ];

  test('resolves the owning project label from the session directory instead of activeProjectId', () => {
    expect(resolveProjectLabelForDirectory({
      projects: configuredProjects,
      availableWorktreesByProject: new Map(),
      directory: '/workspace/beta',
      activeProjectId: 'alpha',
    })).toBe('beta');
  });

  test('falls back to the directory folder name when the session directory is not in projects', () => {
    expect(resolveProjectLabelForDirectory({
      projects: [configuredProjects[0]],
      availableWorktreesByProject: new Map(),
      directory: '/workspace/beta',
      activeProjectId: 'alpha',
    })).toBe('beta');
  });

  test('uses activeProjectId only when no session or draft directory is present', () => {
    expect(resolveProjectLabelForDirectory({
      projects: configuredProjects,
      availableWorktreesByProject: new Map(),
      directory: null,
      activeProjectId: 'alpha',
    })).toBe('alpha');
  });

  test('respects draftProjectId and chat draft target when a draft is open', () => {
    expect(resolveProjectLabelForDirectory({
      projects: configuredProjects,
      availableWorktreesByProject: new Map(),
      directory: '/workspace/alpha',
      activeProjectId: 'alpha',
      isDraftOpen: true,
      draftTarget: 'project',
      draftProjectId: 'beta',
    })).toBe('beta');

    expect(resolveProjectLabelForDirectory({
      projects: configuredProjects,
      availableWorktreesByProject: new Map(),
      directory: '/workspace/alpha',
      activeProjectId: 'alpha',
      isDraftOpen: true,
      draftTarget: 'chat',
    })).toBeNull();
  });
});
