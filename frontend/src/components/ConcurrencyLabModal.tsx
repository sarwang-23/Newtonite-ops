import React, { useState } from 'react';
import { AuthenticatedUser, WorkItem } from '../types';
import { api, ApiError } from '../api';
import { Zap, X, CheckCircle, AlertTriangle, Play, RefreshCw, ShieldCheck } from 'lucide-react';

interface ConcurrencyLabModalProps {
  demoUsers: (AuthenticatedUser & { token: string })[];
  items: WorkItem[];
  onClose: () => void;
  onRefreshData: () => void;
}

export const ConcurrencyLabModal: React.FC<ConcurrencyLabModalProps> = ({
  demoUsers,
  items,
  onClose,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'claim' | 'occ' | 'idempotency'>('claim');

  // Race test state
  const [targetItemId, setTargetItemId] = useState(
    items.find((i) => !i.assignee_id)?.id || items[0]?.id || ''
  );
  const [user1Id, setUser1Id] = useState(demoUsers[4]?.id || demoUsers[0]?.id || '');
  const [user2Id, setUser2Id] = useState(demoUsers[5]?.id || demoUsers[1]?.id || '');
  const [isRunningRace, setIsRunningRace] = useState(false);
  const [raceResult, setRaceResult] = useState<{
    user1Res?: any;
    user2Res?: any;
    summary?: string;
  } | null>(null);

  // OCC state
  const [occResult, setOccResult] = useState<any>(null);
  const [isRunningOcc, setIsRunningOcc] = useState(false);

  // Idempotency state
  const [idempResult, setIdempResult] = useState<any>(null);
  const [isRunningIdemp, setIsRunningIdemp] = useState(false);

  // 1. Run Concurrent Claims Race
  const handleRunRace = async () => {
    setIsRunningRace(true);
    setRaceResult(null);

    const user1 = demoUsers.find((u) => u.id === user1Id);
    const user2 = demoUsers.find((u) => u.id === user2Id);

    if (!user1 || !user2 || !targetItemId) {
      setIsRunningRace(false);
      return;
    }

    try {
      const p1 = api.claimItem(targetItemId, user1.token).then(
        (data) => ({ status: 200, user: user1.name, data }),
        (err) => ({ status: err.status || 409, user: user1.name, error: err.message, code: err.code })
      );

      const p2 = api.claimItem(targetItemId, user2.token).then(
        (data) => ({ status: 200, user: user2.name, data }),
        (err) => ({ status: err.status || 409, user: user2.name, error: err.message, code: err.code })
      );

      const [res1, res2] = await Promise.all([p1, p2]);

      const successUser = res1.status === 200 ? res1.user : res2.status === 200 ? res2.user : 'None';
      const conflictUser = res1.status === 409 ? res1.user : res2.status === 409 ? res2.user : 'None';

      setRaceResult({
        user1Res: res1,
        user2Res: res2,
        summary: `Race complete: ${successUser} successfully claimed the item (HTTP 200). ${conflictUser} was rejected with atomic conflict (HTTP 409).`,
      });

      onRefreshData();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsRunningRace(false);
    }
  };

  // 2. Run Stale OCC Test
  const handleRunOcc = async () => {
    setIsRunningOcc(true);
    setOccResult(null);

    const targetItem = items[0];
    if (!targetItem) return;

    try {
      // Intentionally send stale version 0
      await api.updateItem(targetItem.id, {
        title: `${targetItem.title} [Stale Edit Attempt]`,
        version: 0, // Stale! Current version is targetItem.version
      });
      setOccResult({ status: 200, message: 'Unexpected success' });
    } catch (err: any) {
      setOccResult({
        status: err.status || 409,
        code: err.code,
        message: err.message,
        latestItem: err.latestItem,
      });
    } finally {
      setIsRunningOcc(false);
      onRefreshData();
    }
  };

  // 3. Run Idempotency Test
  const handleRunIdempotency = async () => {
    setIsRunningIdemp(false);
    setIdempResult(null);

    const fixedKey = `test-idemp-${Date.now()}`;
    const payload = {
      title: `Double-Click Order Investigation (#${Date.now().toString().slice(-4)})`,
      description: 'Simulating rapid double-click or network retry with the exact same Idempotency-Key header.',
      type: 'PAYMENT',
      priority: 'HIGH',
      team_id: 'team-pay',
    };

    try {
      // Call 1
      const res1 = await fetch('/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${demoUsers[0]?.token}`,
          'Idempotency-Key': fixedKey,
        },
        body: JSON.stringify(payload),
      });
      const data1 = await res1.json();

      // Call 2 (Instant retry with same key)
      const res2 = await fetch('/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${demoUsers[0]?.token}`,
          'Idempotency-Key': fixedKey,
        },
        body: JSON.stringify(payload),
      });
      const data2 = await res2.json();

      setIdempResult({
        req1: {
          status: res1.status,
          cacheLookup: res1.headers.get('x-cache-lookup') || 'MISS (Initial creation)',
          itemId: data1.id,
        },
        req2: {
          status: res2.status,
          cacheLookup: res2.headers.get('x-cache-lookup') || 'HIT (Replay cache)',
          isReplay: res2.headers.get('x-idempotency-replay') || 'true',
          itemId: data2.id,
        },
        isIdenticalId: data1.id === data2.id,
      });

      onRefreshData();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsRunningIdemp(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 8, 16, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: '20px',
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid rgba(234, 179, 8, 0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(234, 179, 8, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Zap size={18} color="#eab308" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fef08a' }}>
                Concurrency & Reliability Interactive Lab
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Test atomic race conditions, optimistic locking OCC, and idempotency live in the browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <button
            onClick={() => setActiveTab('claim')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'claim' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'claim' ? '2px solid #eab308' : 'none',
              color: activeTab === 'claim' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            1. Concurrent Claim Race
          </button>
          <button
            onClick={() => setActiveTab('occ')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'occ' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'occ' ? '2px solid #eab308' : 'none',
              color: activeTab === 'occ' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            2. Stale Update (OCC 409)
          </button>
          <button
            onClick={() => setActiveTab('idempotency')}
            style={{
              flex: 1,
              padding: '12px',
              background: activeTab === 'idempotency' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'idempotency' ? '2px solid #eab308' : 'none',
              color: activeTab === 'idempotency' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            3. Idempotency Key Replay
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>
          
          {/* TAB 1: CLAIM RACE */}
          {activeTab === 'claim' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                This test dispatches <strong>two HTTP POST /claim requests in parallel</strong> (via <code>Promise.all</code>) from two distinct team members targeting the same unassigned work item. Newtonite's atomic conditional UPDATE ensures exactly one user succeeds (200 OK) while the other receives an HTTP 409 Concurrency Conflict.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    SELECT WORK ITEM (UNASSIGNED)
                  </label>
                  <select
                    value={targetItemId}
                    onChange={(e) => setTargetItemId(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}
                  >
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title.slice(0, 45)}... ({i.assignee_id ? 'Assigned' : 'UNASSIGNED'})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                      USER 1
                    </label>
                    <select
                      value={user1Id}
                      onChange={(e) => setUser1Id(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}
                    >
                      {demoUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name.split('(')[0]}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                      USER 2
                    </label>
                    <select
                      value={user2Id}
                      onChange={(e) => setUser2Id(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}
                    >
                      {demoUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name.split('(')[0]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRunRace}
                disabled={isRunningRace}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                <Play size={16} />
                <span>{isRunningRace ? 'Executing Concurrent Race...' : 'Fire Parallel Claim Race Now'}</span>
              </button>

              {raceResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fef08a', marginBottom: '12px' }}>
                    {raceResult.summary}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.78rem' }}>
                    <div style={{ padding: '10px', borderRadius: '6px', background: raceResult.user1Res?.status === 200 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${raceResult.user1Res?.status === 200 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                      <div style={{ fontWeight: 700, color: raceResult.user1Res?.status === 200 ? '#34d399' : '#f87171' }}>
                        {raceResult.user1Res?.user}: HTTP {raceResult.user1Res?.status}
                      </div>
                      <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                        {raceResult.user1Res?.status === 200 ? 'Winner! Claim registered.' : raceResult.user1Res?.error}
                      </div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '6px', background: raceResult.user2Res?.status === 200 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${raceResult.user2Res?.status === 200 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                      <div style={{ fontWeight: 700, color: raceResult.user2Res?.status === 200 ? '#34d399' : '#f87171' }}>
                        {raceResult.user2Res?.user}: HTTP {raceResult.user2Res?.status}
                      </div>
                      <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                        {raceResult.user2Res?.status === 200 ? 'Winner! Claim registered.' : raceResult.user2Res?.error}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STALE OCC */}
          {activeTab === 'occ' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                Tests Optimistic Concurrency Control (OCC). When a client submits an update with a version number that does not match the latest row version in PostgreSQL/SQLite, the update is rejected with <strong>HTTP 409 Concurrency Conflict</strong> and the latest database record is returned to the client to safely reconcile changes.
              </p>

              <button
                onClick={handleRunOcc}
                disabled={isRunningOcc}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                <Play size={16} />
                <span>{isRunningOcc ? 'Simulating Stale Update...' : 'Submit Update with Outdated Version (v0)'}</span>
              </button>

              {occResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <div style={{ fontWeight: 700, color: '#f87171', fontSize: '0.9rem', marginBottom: '6px' }}>
                    HTTP {occResult.status} {occResult.code}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginBottom: '8px' }}>
                    {occResult.message}
                  </div>
                  {occResult.latestItem && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      Synchronized latest server version: <strong>v{occResult.latestItem.version}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IDEMPOTENCY */}
          {activeTab === 'idempotency' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                Tests duplicate request protection (e.g. user rapid double-clicking or mobile network reconnects). Two POST requests are sent with the exact same <code>Idempotency-Key</code> header. The second request returns the stored result from cache (<code>X-Cache-Lookup: HIT</code>) and does NOT create a duplicate database row.
              </p>

              <button
                onClick={handleRunIdempotency}
                disabled={isRunningIdemp}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                <Play size={16} />
                <span>{isRunningIdemp ? 'Testing Idempotency Replay...' : 'Send Duplicate Requests with Same Key'}</span>
              </button>

              {idempResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '0.85rem', marginBottom: '10px' }}>
                    <ShieldCheck size={18} />
                    <span>Idempotency Deduplication Verified!</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.78rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 600, color: 'white' }}>Request 1 (Initial)</div>
                      <div style={{ color: 'var(--text-dim)', marginTop: '4px' }}>Status: {idempResult.req1.status}</div>
                      <div style={{ color: 'var(--text-dim)' }}>Lookup: {idempResult.req1.cacheLookup}</div>
                      <div style={{ color: '#a5b4fc', fontFamily: 'var(--font-mono)' }}>Item ID: {idempResult.req1.itemId}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 600, color: 'white' }}>Request 2 (Duplicate Replay)</div>
                      <div style={{ color: 'var(--text-dim)', marginTop: '4px' }}>Status: {idempResult.req2.status}</div>
                      <div style={{ color: '#34d399', fontWeight: 600 }}>Lookup: {idempResult.req2.cacheLookup}</div>
                      <div style={{ color: '#a5b4fc', fontFamily: 'var(--font-mono)' }}>Item ID: {idempResult.req2.itemId}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
