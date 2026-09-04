import { createAdminActorLabel } from './admin-actor-label';
import { isCommunityUuid } from './read-service';
import { getServerSupabase } from './supabase';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

export type AdminTab = 'reports' | 'hidden' | 'trash' | 'sanctions' | 'audit';
export type AdminContentStatus = 'hidden' | 'deleted';
export type AdminContentTargetType = 'post' | 'comment';
export type AdminDeletionSource = 'author' | 'admin';
export type AdminSanctionState = 'active' | 'ended';
export type AdminAuditAction =
  | 'hide'
  | 'restore'
  | 'delete'
  | 'restrict'
  | 'unrestrict';
export type AdminAuditTargetType = AdminContentTargetType | 'user';

export interface AdminSummary {
  reports: number;
  hidden: number;
  trash: number;
  sanctions: number;
}

export interface AdminContentItem {
  targetType: AdminContentTargetType;
  targetId: string;
  actorLabel: string;
  authorName: string;
  title: string | null;
  body: string;
  status: AdminContentStatus;
  deletionSource: AdminDeletionSource | null;
  deletedAt: string | null;
  purgeAt: string | null;
  createdAt: string;
}

export interface AdminSanctionItem {
  sanctionId: string;
  actorLabel: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  state: AdminSanctionState;
}

export interface AdminAuditItem {
  id: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId?: string;
  actorLabel: string | null;
  targetTitle: string | null;
  targetBody: string | null;
  reason: string;
  createdAt: string;
}

export interface AdminPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AdminCursor {
  sortAt: string;
  targetType: AdminAuditTargetType;
  targetId: string;
}

export interface AdminContentRecord {
  targetType: AdminContentTargetType;
  targetId: string;
  authorId: string;
  authorName: string;
  title: string | null;
  body: string;
  status: AdminContentStatus;
  deletionSource: AdminDeletionSource | null;
  deletedAt: string | null;
  purgeAt: string | null;
  createdAt: string;
}

export interface AdminSanctionRecord {
  id: string;
  userId: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AdminAuditRecord {
  id: string;
  adminId: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  targetAuthorId: string | null;
  targetTitle: string | null;
  targetBody: string | null;
  reason: string;
  createdAt: string;
}

export interface AdminContentQuery {
  status: AdminContentStatus;
  targetType: AdminContentTargetType | 'all';
  deletionSource: AdminDeletionSource | 'all';
  search: string;
  cursor: AdminCursor | null;
  limit: number;
}

export interface AdminSanctionQuery {
  state: AdminSanctionState;
  search: string;
  cursor: AdminCursor | null;
  limit: number;
  now: string;
}

export interface AdminAuditQuery {
  action: AdminAuditAction | 'all';
  targetType: AdminAuditTargetType | 'all';
  search: string;
  cursor: AdminCursor | null;
  limit: number;
}

export interface AdminConsoleRepository {
  loadSummary(now: string): Promise<AdminSummary>;
  findContent(query: AdminContentQuery): Promise<AdminContentRecord[]>;
  findSanctions(query: AdminSanctionQuery): Promise<AdminSanctionRecord[]>;
  findAudit(query: AdminAuditQuery): Promise<AdminAuditRecord[]>;
}

export class CommunityAdminConsoleError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunityAdminConsoleError';
  }
}

function invalid(code: string, message: string): never {
  throw new CommunityAdminConsoleError(400, code, message);
}

function unavailable(): never {
  throw new CommunityAdminConsoleError(
    503,
    'admin_console_unavailable',
    '관리자 정보를 불러오지 못했습니다.',
  );
}

export function validateAdminTab(value: unknown): AdminTab {
  if (
    value !== 'reports' &&
    value !== 'hidden' &&
    value !== 'trash' &&
    value !== 'sanctions' &&
    value !== 'audit'
  ) {
    invalid('invalid_admin_tab', '관리자 화면 정보를 확인해 주세요.');
  }
  return value;
}

function getLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function getSearch(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    invalid('invalid_admin_search', '검색어를 확인해 주세요.');
  }
  const search = value.trim();
  if (Array.from(search).length > MAX_SEARCH_LENGTH) {
    invalid('invalid_admin_search', '검색어는 100자 이하로 입력해 주세요.');
  }
  return search;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function encodeCursor(cursor: AdminCursor) {
  return btoa(
    JSON.stringify([cursor.sortAt, cursor.targetType, cursor.targetId]),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function decodeCursor(value: unknown): AdminCursor | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    invalid('invalid_admin_cursor', '페이지 정보를 확인할 수 없습니다.');
  }
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded: unknown = JSON.parse(atob(base64 + padding));
    if (!Array.isArray(decoded) || decoded.length !== 3) throw new Error();
    const [sortAt, targetType, targetId] = decoded;
    if (
      !isIsoTimestamp(sortAt) ||
      (targetType !== 'post' &&
        targetType !== 'comment' &&
        targetType !== 'user') ||
      typeof targetId !== 'string' ||
      !isCommunityUuid(targetId)
    ) {
      throw new Error();
    }
    return { sortAt, targetType, targetId: targetId.toLowerCase() };
  } catch {
    invalid('invalid_admin_cursor', '페이지 정보를 확인할 수 없습니다.');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    unavailable();
  return value as Record<string, unknown>;
}

function string(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (typeof value !== 'string') unavailable();
  return value;
}

function nullableString(row: Record<string, unknown>, key: string) {
  return row[key] === null ? null : string(row, key);
}

function targetType(value: unknown): AdminContentTargetType {
  if (value !== 'post' && value !== 'comment') unavailable();
  return value;
}

function auditTargetType(value: unknown): AdminAuditTargetType {
  if (value !== 'post' && value !== 'comment' && value !== 'user')
    unavailable();
  return value;
}

function contentStatus(value: unknown): AdminContentStatus {
  if (value !== 'hidden' && value !== 'deleted') unavailable();
  return value;
}

function deletionSource(value: unknown): AdminDeletionSource | null {
  if (value === null) return null;
  if (value !== 'author' && value !== 'admin') unavailable();
  return value;
}

function auditAction(value: unknown): AdminAuditAction {
  if (
    value !== 'hide' &&
    value !== 'restore' &&
    value !== 'delete' &&
    value !== 'restrict' &&
    value !== 'unrestrict'
  ) {
    unavailable();
  }
  return value;
}

function toContentRecord(value: unknown): AdminContentRecord {
  const row = object(value);
  return {
    targetType: targetType(row.target_type),
    targetId: string(row, 'target_id'),
    authorId: string(row, 'author_id'),
    authorName: string(row, 'author_name'),
    title: nullableString(row, 'title'),
    body: string(row, 'body'),
    status: contentStatus(row.status),
    deletionSource: deletionSource(row.deletion_source),
    deletedAt: nullableString(row, 'deleted_at'),
    purgeAt: nullableString(row, 'purge_at'),
    createdAt: string(row, 'created_at'),
  };
}

function toSanctionRecord(value: unknown): AdminSanctionRecord {
  const row = object(value);
  return {
    id: string(row, 'id'),
    userId: string(row, 'user_id'),
    reason: string(row, 'reason'),
    startsAt: string(row, 'starts_at'),
    endsAt: string(row, 'ends_at'),
    revokedAt: nullableString(row, 'revoked_at'),
    createdAt: string(row, 'created_at'),
  };
}

function relation(value: unknown) {
  if (value === null) return null;
  const resolved = Array.isArray(value) ? (value[0] ?? null) : value;
  return resolved === null ? null : object(resolved);
}

function toAuditRecord(value: unknown): AdminAuditRecord {
  const row = object(value);
  const type = auditTargetType(row.target_type);
  const post = relation(row.community_posts);
  const comment = relation(row.community_comments);
  const target = type === 'post' ? post : type === 'comment' ? comment : null;
  const idKey =
    type === 'post' ? 'post_id' : type === 'comment' ? 'comment_id' : 'user_id';
  return {
    id: string(row, 'id'),
    adminId: string(row, 'admin_id'),
    action: auditAction(row.action),
    targetType: type,
    targetId: string(row, idKey),
    targetAuthorId:
      type === 'user'
        ? string(row, 'user_id')
        : target
          ? string(target, 'author_id')
          : null,
    targetTitle:
      type === 'post' && target ? nullableString(target, 'title') : null,
    targetBody: target ? string(target, 'body') : null,
    reason: string(row, 'reason'),
    createdAt: string(row, 'created_at'),
  };
}

function escapeSearch(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

export const adminConsoleRepository: AdminConsoleRepository = {
  async loadSummary(now) {
    const client = getServerSupabase();
    const [reports, hidden, trash, sanctions] = await Promise.all([
      client
        .from('community_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      client
        .from('community_admin_content')
        .select('target_id', { count: 'exact', head: true })
        .eq('status', 'hidden'),
      client
        .from('community_admin_content')
        .select('target_id', { count: 'exact', head: true })
        .eq('status', 'deleted'),
      client
        .from('community_sanctions')
        .select('id', { count: 'exact', head: true })
        .is('revoked_at', null)
        .gt('ends_at', now),
    ]);
    const results = [reports, hidden, trash, sanctions];
    if (
      results.some((result) => result.error || typeof result.count !== 'number')
    ) {
      unavailable();
    }
    return {
      reports: reports.count as number,
      hidden: hidden.count as number,
      trash: trash.count as number,
      sanctions: sanctions.count as number,
    };
  },

  async findContent(input) {
    const sortColumn = input.status === 'deleted' ? 'deleted_at' : 'created_at';
    let query = getServerSupabase()
      .from('community_admin_content')
      .select(
        'target_type,target_id,author_id,author_name,title,body,status,deletion_source,deleted_at,purge_at,created_at',
      )
      .eq('status', input.status);
    if (input.targetType !== 'all') {
      query = query.eq('target_type', input.targetType);
    }
    if (input.deletionSource !== 'all') {
      query = query.eq('deletion_source', input.deletionSource);
    }
    if (input.search) {
      const search = escapeSearch(input.search);
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }
    if (input.cursor) {
      query = query.or(
        `${sortColumn}.lt.${input.cursor.sortAt},and(${sortColumn}.eq.${input.cursor.sortAt},target_type.lt.${input.cursor.targetType}),and(${sortColumn}.eq.${input.cursor.sortAt},target_type.eq.${input.cursor.targetType},target_id.lt.${input.cursor.targetId})`,
      );
    }
    const { data, error } = await query
      .order(sortColumn, { ascending: false })
      .order('target_type', { ascending: false })
      .order('target_id', { ascending: false })
      .limit(input.limit);
    if (error || !Array.isArray(data)) unavailable();
    return data.map(toContentRecord);
  },

  async findSanctions(input) {
    let query = getServerSupabase()
      .from('community_sanctions')
      .select('id,user_id,reason,starts_at,ends_at,revoked_at,created_at');
    if (input.state === 'active') {
      query = query.is('revoked_at', null).gt('ends_at', input.now);
    } else {
      query = query.or(`revoked_at.not.is.null,ends_at.lte.${input.now}`);
    }
    if (input.search) {
      query = query.ilike('reason', `%${escapeSearch(input.search)}%`);
    }
    if (input.cursor) {
      query = query.or(
        `created_at.lt.${input.cursor.sortAt},and(created_at.eq.${input.cursor.sortAt},id.lt.${input.cursor.targetId})`,
      );
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(input.limit);
    if (error || !Array.isArray(data)) unavailable();
    return data.map(toSanctionRecord);
  },

  async findAudit(input) {
    let query = getServerSupabase()
      .from('community_moderation_actions')
      .select(
        'id,admin_id,action,target_type,post_id,comment_id,user_id,reason,created_at,community_posts(id,author_id,title,body),community_comments(id,author_id,body)',
      );
    if (input.action !== 'all') query = query.eq('action', input.action);
    if (input.targetType !== 'all') {
      query = query.eq('target_type', input.targetType);
    }
    if (input.search) {
      query = query.ilike('reason', `%${escapeSearch(input.search)}%`);
    }
    if (input.cursor) {
      query = query.or(
        `created_at.lt.${input.cursor.sortAt},and(created_at.eq.${input.cursor.sortAt},target_type.lt.${input.cursor.targetType}),and(created_at.eq.${input.cursor.sortAt},target_type.eq.${input.cursor.targetType},id.lt.${input.cursor.targetId})`,
      );
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('target_type', { ascending: false })
      .order('id', { ascending: false })
      .limit(input.limit);
    if (error || !Array.isArray(data)) unavailable();
    return data.map(toAuditRecord);
  },
};

function createPage<T>(
  rows: T[],
  limit: number,
  cursorFor: (item: T) => AdminCursor,
): AdminPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last ? encodeCursor(cursorFor(last)) : null,
  };
}

function actorLabel(userId: string, secret?: string) {
  try {
    return createAdminActorLabel(userId, secret);
  } catch {
    unavailable();
  }
}

function inputObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('invalid_admin_input', '관리자 조회 조건을 확인해 주세요.');
  }
  return value as Record<string, unknown>;
}

export async function getAdminSummary(
  repository: AdminConsoleRepository = adminConsoleRepository,
  now: Date = new Date(),
) {
  if (Number.isNaN(now.getTime())) unavailable();
  return repository.loadSummary(now.toISOString());
}

export async function listAdminContent(
  input: unknown,
  repository: AdminConsoleRepository = adminConsoleRepository,
  secret?: string,
): Promise<AdminPage<AdminContentItem>> {
  const row = inputObject(input);
  if (row.status !== 'hidden' && row.status !== 'deleted') {
    invalid('invalid_content_status', '콘텐츠 상태를 확인해 주세요.');
  }
  const status = row.status;
  const selectedTargetType = row.targetType ?? 'all';
  if (
    selectedTargetType !== 'all' &&
    selectedTargetType !== 'post' &&
    selectedTargetType !== 'comment'
  ) {
    invalid('invalid_target_type', '콘텐츠 유형을 확인해 주세요.');
  }
  const selectedDeletionSource = row.deletionSource ?? 'all';
  if (
    selectedDeletionSource !== 'all' &&
    selectedDeletionSource !== 'author' &&
    selectedDeletionSource !== 'admin'
  ) {
    invalid('invalid_deletion_source', '삭제 주체를 확인해 주세요.');
  }
  const limit = getLimit(row.limit);
  const rows = await repository.findContent({
    status,
    targetType: selectedTargetType,
    deletionSource: selectedDeletionSource,
    search: getSearch(row.search),
    cursor: decodeCursor(row.cursor),
    limit: limit + 1,
  });
  const items = rows.map<AdminContentItem>((item) => ({
    targetType: item.targetType,
    targetId: item.targetId,
    actorLabel: actorLabel(item.authorId, secret),
    authorName: item.authorName,
    title: item.title,
    body: item.body,
    status: item.status,
    deletionSource: item.deletionSource,
    deletedAt: item.deletedAt,
    purgeAt: item.purgeAt,
    createdAt: item.createdAt,
  }));
  return createPage(items, limit, (item) => ({
    sortAt: item.deletedAt ?? item.createdAt,
    targetType: item.targetType,
    targetId: item.targetId,
  }));
}

export async function listAdminSanctions(
  input: unknown,
  repository: AdminConsoleRepository = adminConsoleRepository,
  secret?: string,
  now: Date = new Date(),
): Promise<AdminPage<AdminSanctionItem>> {
  const row = inputObject(input);
  if (row.state !== 'active' && row.state !== 'ended') {
    invalid('invalid_sanction_state', '제재 상태를 확인해 주세요.');
  }
  if (Number.isNaN(now.getTime())) unavailable();
  const state = row.state;
  const limit = getLimit(row.limit);
  const rows = await repository.findSanctions({
    state,
    search: getSearch(row.search),
    cursor: decodeCursor(row.cursor),
    limit: limit + 1,
    now: now.toISOString(),
  });
  const items = rows.map<AdminSanctionItem>((item) => ({
    sanctionId: item.id,
    actorLabel: actorLabel(item.userId, secret),
    reason: item.reason,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    revokedAt: item.revokedAt,
    state:
      item.revokedAt === null && Date.parse(item.endsAt) > now.getTime()
        ? 'active'
        : 'ended',
  }));
  return createPage(items, limit, (item) => ({
    sortAt:
      rows.find((record) => record.id === item.sanctionId)?.createdAt ??
      item.startsAt,
    targetType: 'user',
    targetId: item.sanctionId,
  }));
}

export async function listAdminAudit(
  input: unknown,
  repository: AdminConsoleRepository = adminConsoleRepository,
  secret?: string,
): Promise<AdminPage<AdminAuditItem>> {
  const row = inputObject(input);
  const selectedAction = row.action ?? 'all';
  if (
    selectedAction !== 'all' &&
    selectedAction !== 'hide' &&
    selectedAction !== 'restore' &&
    selectedAction !== 'delete' &&
    selectedAction !== 'restrict' &&
    selectedAction !== 'unrestrict'
  ) {
    invalid('invalid_audit_action', '관리 조치 유형을 확인해 주세요.');
  }
  const selectedTargetType = row.targetType ?? 'all';
  if (
    selectedTargetType !== 'all' &&
    selectedTargetType !== 'post' &&
    selectedTargetType !== 'comment' &&
    selectedTargetType !== 'user'
  ) {
    invalid('invalid_target_type', '관리 대상 유형을 확인해 주세요.');
  }
  const limit = getLimit(row.limit);
  const rows = await repository.findAudit({
    action: selectedAction,
    targetType: selectedTargetType,
    search: getSearch(row.search),
    cursor: decodeCursor(row.cursor),
    limit: limit + 1,
  });
  const items = rows.map<AdminAuditItem>((item) => ({
    id: item.id,
    action: item.action,
    targetType: item.targetType,
    ...(item.targetType === 'user' ? {} : { targetId: item.targetId }),
    actorLabel: item.targetAuthorId
      ? actorLabel(item.targetAuthorId, secret)
      : null,
    targetTitle: item.targetTitle,
    targetBody: item.targetBody,
    reason: item.reason,
    createdAt: item.createdAt,
  }));
  return createPage(items, limit, (item) => ({
    sortAt: item.createdAt,
    targetType: item.targetType,
    targetId: item.id,
  }));
}
