import type { ProjectEntry } from "@/lib/api/types";
import type { WorktreeMetadata } from "@/types/worktree";

import { normalizePath } from "@/lib/pathNormalization";
import { spaceIdOfDirectory } from "@/lib/spaces/space-route";
import { spaceProjectDirectoryOf } from "@/lib/spaces/spaces-store";
export const normalizeProjectPath = normalizePath;

export const resolveProjectForDirectory = (
  projects: ProjectEntry[],
  directory: string | null,
): ProjectEntry | null => {
  const nd = normalizeProjectPath(directory);
  if (!nd) return null;
  let best: ProjectEntry | null = null;
  for (const p of projects) {
    const pp = normalizeProjectPath(p.path);
    if (!pp) continue;
    if (nd !== pp && !nd.startsWith(pp.endsWith('/') ? pp : `${pp}/`)) continue;
    if (!best || pp.length > (normalizeProjectPath(best.path)?.length ?? 0)) best = p;
  }
  return best;
};

const resolveProjectFromWorktreeDirectory = (
  projects: ProjectEntry[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  directory: string | null,
): { project: ProjectEntry; matchedWorktreePathLength: number } | null => {
  const nd = normalizeProjectPath(directory);
  if (!nd) return null;
  let matchedWorktree: WorktreeMetadata | null = null;
  let matchedProjectPath: string | null = null;
  let bestLen = -1;
  for (const [projectPath, worktrees] of availableWorktreesByProject.entries()) {
    for (const wt of worktrees) {
      const wp = normalizeProjectPath(wt.path);
      if (!wp) continue;
      if (nd !== wp && !nd.startsWith(wp.endsWith('/') ? wp : `${wp}/`)) continue;
      if (wp.length > bestLen) {
        bestLen = wp.length;
        matchedWorktree = wt;
        matchedProjectPath = normalizeProjectPath(projectPath);
      }
    }
  }
  if (!matchedWorktree) return null;
  const candidates = [normalizeProjectPath(matchedWorktree.projectDirectory), matchedProjectPath]
    .filter((v): v is string => Boolean(v));
  for (const c of candidates) {
    const exact = projects.find((p) => normalizeProjectPath(p.path) === c) ?? null;
    if (exact) return { project: exact, matchedWorktreePathLength: bestLen };
    const nested = resolveProjectForDirectory(projects, c);
    if (nested) return { project: nested, matchedWorktreePathLength: bestLen };
  }
  return null;
};

export const resolveProjectForSessionDirectory = (
  projects: ProjectEntry[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  directory: string | null,
  /**
   * The host project of the space `directory` lies in, when the caller subscribed to it (a
   * render that must follow the space list arriving); read from the spaces store otherwise.
   */
  spaceProjectDirectory: string | null = spaceProjectDirectoryOf(directory),
): ProjectEntry | null => {
  // An isolated space's directory (`/spaces/<id>/...`) lies under no project on the host: its
  // session belongs to the project the space was made from, as a worktree's belongs to its
  // repository's.
  if (spaceProjectDirectory) return resolveProjectForDirectory(projects, spaceProjectDirectory);
  const directProject = resolveProjectForDirectory(projects, directory);
  const worktreeResolution = resolveProjectFromWorktreeDirectory(projects, availableWorktreesByProject, directory);
  if (!directProject) return worktreeResolution?.project ?? null;
  if (!worktreeResolution) return directProject;

  const directPathLength = normalizeProjectPath(directProject.path)?.length ?? 0;
  return worktreeResolution.matchedWorktreePathLength > directPathLength
    ? worktreeResolution.project
    : directProject;
};

const formatDirectoryBasename = (directory: string | null): string | null => {
  const normalizedPath = normalizeProjectPath(directory);
  if (!normalizedPath) {
    return null;
  }
  if (normalizedPath === '/') {
    return '/';
  }
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
};

const formatProjectEntryLabel = (project: ProjectEntry): string | null => {
  const trimmedLabel = project.label?.trim();
  if (trimmedLabel) {
    return trimmedLabel;
  }
  return formatDirectoryBasename(project.path);
};

interface ResolveProjectLabelInput {
  projects: ProjectEntry[];
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>;
  directory: string | null;
  spaceProjectDirectory?: string | null;
  activeProjectId?: string | null;
  isDraftOpen?: boolean;
  draftTarget?: 'project' | 'chat';
  draftProjectId?: string | null;
}

/**
 * Resolves the project label for the header or work-status surface from the
 * session/draft directory first, falling back to the directory's folder name
 * when a concrete directory is not registered as a project in this window, and
 * only using `activeProjectId` when no directory is open.
 */
export const resolveProjectLabelForDirectory = ({
  projects,
  availableWorktreesByProject,
  directory,
  spaceProjectDirectory,
  activeProjectId = null,
  isDraftOpen = false,
  draftTarget = 'project',
  draftProjectId = null,
}: ResolveProjectLabelInput): string | null => {
  if (isDraftOpen) {
    if (draftTarget === 'chat') {
      return null;
    }
    if (draftProjectId) {
      const draftProject = projects.find((project) => project.id === draftProjectId) ?? null;
      if (draftProject) {
        return formatProjectEntryLabel(draftProject);
      }
    }
  }

  const normalizedDirectory = normalizeProjectPath(directory);
  if (normalizedDirectory) {
    const resolvedSpaceProjectDirectory = spaceProjectDirectory !== undefined
      ? spaceProjectDirectory
      : spaceProjectDirectoryOf(normalizedDirectory);
    const ownerProject = resolveProjectForSessionDirectory(
      projects,
      availableWorktreesByProject,
      normalizedDirectory,
      resolvedSpaceProjectDirectory,
    );
    if (ownerProject) {
      return formatProjectEntryLabel(ownerProject);
    }
    if (spaceIdOfDirectory(normalizedDirectory) !== null) {
      return resolvedSpaceProjectDirectory ? formatDirectoryBasename(resolvedSpaceProjectDirectory) : null;
    }
    return formatDirectoryBasename(normalizedDirectory);
  }

  if (activeProjectId) {
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    if (activeProject) {
      return formatProjectEntryLabel(activeProject);
    }
  }

  return null;
};
