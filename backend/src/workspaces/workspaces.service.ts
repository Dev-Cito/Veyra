import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { isUniqueViolation } from '../database/pg-errors.js';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import type { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { WorkspaceMember } from './entities/workspace-member.entity.js';
import {
  Workspace,
  WORKSPACE_SLUG_UNIQUE,
} from './entities/workspace.entity.js';
import { nextSlug, slugify } from './slugify.js';
import { MembershipStatus, WorkspaceRole } from './workspace.enums.js';
import type { WorkspaceMembership } from './workspace-membership.js';

// Two concurrent creations can compute the same free slug; the loser retries.
const MAX_SLUG_ATTEMPTS = 5;

export type WorkspaceWithRole = Workspace & { role: WorkspaceRole };

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  /**
   * Creates the workspace and its OWNER membership atomically: a workspace
   * without an owner is a corrupt state.
   */
  async create(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    const base = slugify(dto.name);

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      try {
        const workspace = await this.dataSource.transaction(async (manager) => {
          const slug = await this.findFreeSlug(manager, base);
          const created = await manager.save(
            manager.create(Workspace, {
              name: dto.name,
              slug,
              createdById: userId,
            }),
          );
          await manager.save(
            manager.create(WorkspaceMember, {
              workspaceId: created.id,
              userId,
              role: WorkspaceRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            }),
          );
          return created;
        });
        return withRole(workspace, WorkspaceRole.OWNER);
      } catch (err) {
        if (!isUniqueViolation(err, WORKSPACE_SLUG_UNIQUE)) {
          throw err;
        }
      }
    }
    throw new ConflictException(
      'Could not allocate a unique slug, please retry',
    );
  }

  async findMine(userId: string): Promise<WorkspaceWithRole[]> {
    const memberships = await this.members.find({
      where: { userId, status: MembershipStatus.ACTIVE },
      relations: { workspace: true },
      order: { workspace: { name: 'ASC' } },
    });
    return memberships.map((m) => withRole(m.workspace, m.role));
  }

  async findOne(membership: WorkspaceMembership): Promise<WorkspaceWithRole> {
    const workspace = await this.getWorkspace(membership.workspaceId);
    return withRole(workspace, membership.role);
  }

  /** The slug is intentionally stable across renames so URLs keep working. */
  async update(
    membership: WorkspaceMembership,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    const workspace = await this.getWorkspace(membership.workspaceId);
    if (dto.name !== undefined) {
      workspace.name = dto.name;
    }
    const saved = await this.workspaces.save(workspace);
    return withRole(saved, membership.role);
  }

  /** Memberships are removed by the ON DELETE CASCADE foreign key. */
  async remove(membership: WorkspaceMembership): Promise<void> {
    if (membership.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException('Only an OWNER can delete a workspace');
    }
    await this.workspaces.delete({ id: membership.workspaceId });
  }

  listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.members.find({
      where: { workspaceId },
      relations: { user: true },
      order: { invitedAt: 'ASC' },
    });
  }

  async updateMemberRole(
    actor: WorkspaceMembership,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<WorkspaceMember> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockWorkspace(manager, actor.workspaceId);
      const target = await this.getMember(manager, actor.workspaceId, memberId);

      if (target.userId === actor.userId) {
        throw new ForbiddenException('You cannot change your own role');
      }
      assertCanManage(actor, target, dto.role);
      if (target.role === dto.role) {
        return;
      }

      if (target.role === WorkspaceRole.OWNER) {
        await this.assertNotLastOwner(manager, target);
      }

      target.role = dto.role;
      await manager.save(target);
    });

    return this.members.findOneOrFail({
      where: { id: memberId },
      relations: { user: true },
    });
  }

  async removeMember(
    actor: WorkspaceMembership,
    memberId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockWorkspace(manager, actor.workspaceId);
      const target = await this.getMember(manager, actor.workspaceId, memberId);

      assertCanManage(actor, target);
      if (target.role === WorkspaceRole.OWNER) {
        await this.assertNotLastOwner(manager, target);
      }

      await manager.delete(WorkspaceMember, { id: target.id });
    });
  }

  private async getWorkspace(id: string): Promise<Workspace> {
    const workspace = await this.workspaces.findOneBy({ id });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  private async findFreeSlug(
    manager: EntityManager,
    base: string,
  ): Promise<string> {
    // `base` only contains [a-z0-9-], so it is safe inside the regex.
    const rows = await manager
      .createQueryBuilder(Workspace, 'w')
      .select('w.slug', 'slug')
      .where('w.slug = :base OR w.slug ~ :pattern', {
        base,
        pattern: `^${base}-[0-9]+$`,
      })
      .getRawMany<{ slug: string }>();
    return nextSlug(
      base,
      rows.map((r) => r.slug),
    );
  }

  /**
   * Serialises membership mutations per workspace, so two OWNERs demoting each
   * other concurrently cannot both pass the last-owner check.
   */
  private async lockWorkspace(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<void> {
    const workspace = await manager.findOne(Workspace, {
      where: { id: workspaceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
  }

  private async getMember(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMember> {
    const member = await manager.findOneBy(WorkspaceMember, {
      id: memberId,
      workspaceId,
    });
    if (!member) {
      throw new NotFoundException('Member not found in this workspace');
    }
    return member;
  }

  /**
   * State rule, not a permission one: the caller may manage this member, but
   * the workspace would be left without an active OWNER (409).
   */
  private async assertNotLastOwner(
    manager: EntityManager,
    target: WorkspaceMember,
  ): Promise<void> {
    const otherActiveOwners = await manager.countBy(WorkspaceMember, {
      workspaceId: target.workspaceId,
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
      id: Not(target.id),
    });
    if (otherActiveOwners === 0) {
      throw new ConflictException(
        'Cannot remove or demote the last active OWNER: a workspace must keep at least one',
      );
    }
  }
}

/** Exposes the caller's role alongside the workspace in API responses. */
function withRole(
  workspace: Workspace,
  role: WorkspaceRole,
): WorkspaceWithRole {
  return Object.assign(workspace, { role });
}

/**
 * Role-hierarchy rules, enforced here regardless of what the route guard
 * already allows.
 */
function assertCanManage(
  actor: WorkspaceMembership,
  target: WorkspaceMember,
  newRole?: WorkspaceRole,
): void {
  if (actor.role === WorkspaceRole.MEMBER) {
    throw new ForbiddenException('Members cannot manage other members');
  }
  if (
    actor.role !== WorkspaceRole.OWNER &&
    (target.role === WorkspaceRole.OWNER || newRole === WorkspaceRole.OWNER)
  ) {
    throw new ForbiddenException(
      'Only an OWNER can remove, demote or promote to OWNER',
    );
  }
}
