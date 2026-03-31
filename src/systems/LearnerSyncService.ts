import type { LearnerAttemptSubmission, LearnerSnapshot, LearnerSyncResult } from '../utils/Types';
import { LearnerStateManager } from './LearnerStateManager';
import { ProfileManager } from './ProfileManager';

const API_BASE_KEY = 'crow_learner_api_base';

export class LearnerSyncService {
    private static instance: LearnerSyncService;
    private activeChildId: string | null = null;

    private constructor() {}

    static getInstance(): LearnerSyncService {
        if (!LearnerSyncService.instance) {
            LearnerSyncService.instance = new LearnerSyncService();
        }
        return LearnerSyncService.instance;
    }

    init(snapshot: LearnerSnapshot): void {
        this.activeChildId = snapshot.childId;
        this.cacheSnapshot(snapshot);

        if (this.hasRemoteBackend()) {
            void this.refreshRemoteState(snapshot.childId);
        }
    }

    private async refreshRemoteState(childId: string): Promise<void> {
        await this.getLearnerSnapshot(childId);
        await this.syncPendingAttempts(childId);
    }

    async getLearnerSnapshot(childId: string): Promise<LearnerSnapshot> {
        const cached = this.getCachedSnapshot(childId) ?? LearnerStateManager.getInstance().getSnapshot();
        const apiBase = this.getApiBase();
        if (!apiBase) {
            return cached;
        }

        try {
            const response = await fetch(`${apiBase}/learner/${encodeURIComponent(childId)}/snapshot`);
            if (!response.ok) {
                throw new Error(`snapshot fetch failed: ${response.status}`);
            }

            const snapshot = this.normalizeSnapshot(
                await response.json() as LearnerSnapshot,
                childId,
            );
            this.cacheSnapshot(snapshot);
            if (this.activeChildId === childId) {
                LearnerStateManager.getInstance().replaceSnapshot(snapshot);
            }
            return snapshot;
        } catch (error) {
            console.warn('[LearnerSyncService] Falling back to cached snapshot', error);
            return cached;
        }
    }

    async submitAttempt(attempt: LearnerAttemptSubmission): Promise<LearnerSyncResult> {
        this.enqueueAttempt(attempt);
        const localSnapshot = LearnerStateManager.getInstance().getSnapshot();
        this.cacheSnapshot(localSnapshot);

        const apiBase = this.getApiBase();
        if (!apiBase) {
            LearnerStateManager.getInstance().updateSyncMetadata('local-only', localSnapshot.latestSyncCursor, localSnapshot.lastSyncedAt);
            const localOnlySnapshot = LearnerStateManager.getInstance().getSnapshot();
            this.cacheSnapshot(localOnlySnapshot);
            return {
                snapshot: localOnlySnapshot,
                appliedAttemptIds: [],
                latestSyncCursor: localOnlySnapshot.latestSyncCursor,
            };
        }

        try {
            const response = await fetch(`${apiBase}/learner/${encodeURIComponent(attempt.childId)}/attempt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(attempt),
            });
            if (!response.ok) {
                throw new Error(`attempt submit failed: ${response.status}`);
            }

            const result = await response.json() as LearnerSyncResult;
            this.removeQueuedAttempts(attempt.childId, result.appliedAttemptIds);

            const syncedSnapshot = this.normalizeSnapshot(
                result.snapshot ?? localSnapshot,
                attempt.childId,
            );
            LearnerStateManager.getInstance().replaceSnapshot(syncedSnapshot);
            LearnerStateManager.getInstance().updateSyncMetadata(
                'synced',
                result.latestSyncCursor,
                Date.now(),
            );

            const latest = LearnerStateManager.getInstance().getSnapshot();
            this.cacheSnapshot(latest);
            return {
                snapshot: latest,
                appliedAttemptIds: result.appliedAttemptIds,
                latestSyncCursor: result.latestSyncCursor,
            };
        } catch (error) {
            console.warn('[LearnerSyncService] Attempt queued for retry', error);
            LearnerStateManager.getInstance().updateSyncMetadata('pending', localSnapshot.latestSyncCursor, localSnapshot.lastSyncedAt);
            const pendingSnapshot = LearnerStateManager.getInstance().getSnapshot();
            this.cacheSnapshot(pendingSnapshot);
            return {
                snapshot: pendingSnapshot,
                appliedAttemptIds: [],
                latestSyncCursor: pendingSnapshot.latestSyncCursor,
            };
        }
    }

    async syncPendingAttempts(childId: string, pendingAttempts?: LearnerAttemptSubmission[]): Promise<LearnerSyncResult> {
        const apiBase = this.getApiBase();
        const attempts = pendingAttempts ?? this.getQueuedAttempts(childId);
        const localSnapshot = this.getCachedSnapshot(childId) ?? LearnerStateManager.getInstance().getSnapshot();

        if (!apiBase || attempts.length === 0) {
            return {
                snapshot: localSnapshot,
                appliedAttemptIds: [],
                latestSyncCursor: localSnapshot.latestSyncCursor,
            };
        }

        try {
            const response = await fetch(`${apiBase}/learner/${encodeURIComponent(childId)}/attempts/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attempts }),
            });
            if (!response.ok) {
                throw new Error(`pending sync failed: ${response.status}`);
            }

            const result = await response.json() as LearnerSyncResult;
            this.removeQueuedAttempts(childId, result.appliedAttemptIds);

            const syncedSnapshot = this.normalizeSnapshot(
                result.snapshot ?? localSnapshot,
                childId,
            );
            LearnerStateManager.getInstance().replaceSnapshot(syncedSnapshot);
            LearnerStateManager.getInstance().updateSyncMetadata(
                'synced',
                result.latestSyncCursor,
                Date.now(),
            );

            const latest = LearnerStateManager.getInstance().getSnapshot();
            this.cacheSnapshot(latest);
            return {
                snapshot: latest,
                appliedAttemptIds: result.appliedAttemptIds,
                latestSyncCursor: result.latestSyncCursor,
            };
        } catch (error) {
            console.warn('[LearnerSyncService] Pending attempts still queued', error);
            LearnerStateManager.getInstance().updateSyncMetadata('pending', localSnapshot.latestSyncCursor, localSnapshot.lastSyncedAt);
            const pendingSnapshot = LearnerStateManager.getInstance().getSnapshot();
            this.cacheSnapshot(pendingSnapshot);
            return {
                snapshot: pendingSnapshot,
                appliedAttemptIds: [],
                latestSyncCursor: pendingSnapshot.latestSyncCursor,
            };
        }
    }

    private hasRemoteBackend(): boolean {
        return this.getApiBase() !== null;
    }

    private getApiBase(): string | null {
        try {
            const raw = localStorage.getItem(API_BASE_KEY)?.trim();
            if (!raw) return null;
            return raw.endsWith('/') ? raw.slice(0, -1) : raw;
        } catch {
            return null;
        }
    }

    private cacheSnapshot(snapshot: LearnerSnapshot): void {
        try {
            localStorage.setItem(this.getSnapshotKey(snapshot.childId), JSON.stringify(snapshot));
        } catch (error) {
            console.warn('[LearnerSyncService] Failed to cache learner snapshot', error);
        }
    }

    private getCachedSnapshot(childId: string): LearnerSnapshot | null {
        try {
            const raw = localStorage.getItem(this.getSnapshotKey(childId));
            return raw ? JSON.parse(raw) as LearnerSnapshot : null;
        } catch {
            return null;
        }
    }

    private enqueueAttempt(attempt: LearnerAttemptSubmission): void {
        const queue = this.getQueuedAttempts(attempt.childId);
        if (queue.some(entry => entry.attemptId === attempt.attemptId)) {
            return;
        }
        queue.push(attempt);
        this.saveQueuedAttempts(attempt.childId, queue);
    }

    private removeQueuedAttempts(childId: string, appliedAttemptIds: string[]): void {
        const pending = this.getQueuedAttempts(childId)
            .filter(attempt => !appliedAttemptIds.includes(attempt.attemptId));
        this.saveQueuedAttempts(childId, pending);
    }

    private getQueuedAttempts(childId: string): LearnerAttemptSubmission[] {
        try {
            const raw = localStorage.getItem(this.getPendingKey(childId));
            return raw ? JSON.parse(raw) as LearnerAttemptSubmission[] : [];
        } catch {
            return [];
        }
    }

    private saveQueuedAttempts(childId: string, attempts: LearnerAttemptSubmission[]): void {
        try {
            localStorage.setItem(this.getPendingKey(childId), JSON.stringify(attempts));
        } catch (error) {
            console.warn('[LearnerSyncService] Failed to persist pending attempts', error);
        }
    }

    private getSnapshotKey(childId: string): string {
        return `crow_learner_snapshot_${childId}`;
    }

    private getPendingKey(childId: string): string {
        return `crow_learner_pending_attempts_${childId}`;
    }

    private normalizeSnapshot(snapshot: LearnerSnapshot, requestedChildId: string): LearnerSnapshot {
        const normalized: LearnerSnapshot = {
            ...snapshot,
            childId: requestedChildId,
        };

        const activeProfile = ProfileManager.getInstance().getActiveProfile();
        if (activeProfile && activeProfile.childId === requestedChildId) {
            normalized.childId = activeProfile.childId;
            normalized.familyId = activeProfile.familyId;
        }

        return normalized;
    }
}
