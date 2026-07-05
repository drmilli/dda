import type { ProjectRow } from '../db/repo.js';
import type { Project } from './module.js';

/** Map a persisted project row into the module-facing Project shape. */
export function toModuleProject(row: ProjectRow): Project {
  return {
    id: row.id,
    mint: row.mint,
    creator: row.creator,
    xHandle: row.xHandle,
    githubUrl: row.githubUrl,
    websiteUrl: row.websiteUrl,
    launchTs: row.launchTs.toISOString(),
  };
}
