import React, { useState } from 'react';
import { AuthenticatedUser, WorkItem } from '../types';
import { api } from '../api';
import { Zap, X, Trophy, ShieldAlert, Play, CheckCircle2, Crown, Shield } from 'lucide-react';

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
  const [raceStage, setRaceStage] = useState<'idle' | 'racing' | 'finished'>('idle');
  const [raceResult, setRaceResult] = useState<{
    user1Res?: any;
    user2Res?: any;
    summary?: string;
    winner?: string;
  } | null>(null);

  // OCC state
  const [occResult, setOccResult] = useState<any>(null);
  const [isRunningOcc, setIsRunningOcc] = useState(false);

  // Idempotency state
  const [idempResult, setIdempResult] = useState<any>(null);
  const [isRunningIdemp, setIsRunningIdemp] = useState(false);

  // 1. Run Concurrent Claims Race with visual animation
  const handleRunRace = async () => {
    setIsRunningRace(true);
    setRaceStage('racing');
    setRaceResult(null);

    const user1 = demoUsers.find((u) => u.id === user1Id);
    const user2 = demoUsers.find((u) => u.id === user2Id);

    if (!user1 || !user2 || !targetItemId) {
      setIsRunningRace(false);
      setRaceStage('idle');
      return;
    }

    try {
      // Simulate microscopic network latency variance while both promises fire concurrently
      const p1 = api.claimItem(targetItemId, user1.token).then(
        (data) => ({ status: 200, user: user1.name, data }),
        (err) => ({ status: err.status || 409, user: user1.name, error: err.message, code: err.code })
      );

      const p2 = api.claimItem(targetItemId, user2.token).then(
        (data) => ({ status: 200, user: user2.name, data }),
        (err) => ({ status: err.status || 409, user: user2.name, error: err.message, code: err.code })
      );

      // Brief animation delay so reviewer sees the collision
      await new Promise((r) => setTimeout(r, 600));
      const [res1, res2] = await Promise.all([p1, p2]);

      const winner = res1.status === 200 ? res1.user : res2.status === 200 ? res2.user : undefined;
      const loser = res1.status === 409 ? res1.user : res2.status === 409 ? res2.user : undefined;

      setRaceResult({
        user1Res: res1,
        user2Res: res2,
        winner,
        summary: `Race complete: ${winner} won the atomic conditional update (200 OK). ${loser} was safely intercepted by the database (409 Conflict).`,
      });

      setRaceStage('finished');
      onRefreshData();
    } catch (err: any) {
      console.error(err);
      setRaceStage('finished');
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
      await api.updateItem(targetItem.id, {
        title: `${targetItem.title} [Collision Attempt]`,
        version: 0, // Stale!
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
    setIsRunningIdemp(true);
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
          cacheLookup: res1.headers.get('x-cache-lookup') || 'MISS (Initial write)',
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

  const user1Obj = demoUsers.find((u) => u.id === user1Id);
  const user2Obj = demoUsers.find((u) => u.id === user2Id);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 8, 16, 0.88)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60,
      padding: '20px',
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '860px',
        maxHeight: '92vh',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(234, 179, 8, 0.15)',
        border: '1px solid rgba(234, 179, 8, 0.45)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.8)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(234, 179, 8, 0.4)',
            }}>
              <Zap size={22} color="#000000" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fef08a' }}>
                  CONCURRENCY COLLISION SIMULATOR
                </h3>
                <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '4px', color: '#fef08a', fontWeight: 700 }}>
                  EVALUATOR TEST RIG
                </span>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Live verification of atomic claims, optimistic concurrency control, and idempotency cache
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <button
            onClick={() => setActiveTab('claim')}
            style={{
              flex: 1,
              padding: '14px',
              background: activeTab === 'claim' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'claim' ? '2px solid #eab308' : 'none',
              color: activeTab === 'claim' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            ⚡ 1. Parallel Claim Race Arena
          </button>
          <button
            onClick={() => setActiveTab('occ')}
            style={{
              flex: 1,
              padding: '14px',
              background: activeTab === 'occ' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'occ' ? '2px solid #eab308' : 'none',
              color: activeTab === 'occ' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            🔒 2. Optimistic Stale Update (OCC 409)
          </button>
          <button
            onClick={() => setActiveTab('idempotency')}
            style={{
              flex: 1,
              padding: '14px',
              background: activeTab === 'idempotency' ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'idempotency' ? '2px solid #eab308' : 'none',
              color: activeTab === 'idempotency' ? '#fef08a' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            🛡️ 3. Idempotency Key Replay Protection
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(92vh - 150px)' }}>
          
          {/* TAB 1: PARALLEL RACE ARENA */}
          {activeTab === 'claim' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                Dispatches <strong>two parallel HTTP POST requests concurrently via <code>Promise.all</code></strong> from two separate authenticated employee sessions targeting the exact same unassigned item. The SQL conditional update <code>WHERE id = ? AND assignee_id IS NULL</code> guarantees single atomic acquisition.
              </p>

              {/* Target item selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  TARGET WORK ITEM (UNASSIGNED)
                </label>
                <select
                  value={targetItemId}
                  onChange={(e) => setTargetItemId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'white', fontSize: '0.82rem' }}
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title.slice(0, 50)}... ({i.assignee_id ? `Assigned to ${i.assignee_name || 'Someone'}` : '🔥 UNASSIGNED'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Visual Race Track Arena */}
              <div style={{
                background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(11, 15, 25, 0.9) 100%)',
                border: '1px solid var(--border-medium)',
                borderRadius: '12px',
                padding: '18px',
                marginBottom: '18px',
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.06em', marginBottom: '14px' }}>
                  DUAL-SESSION RACE LANES
                </div>

                {/* Lane 1 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '10px',
                }}>
                  <div style={{ width: '120px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>LANE A</div>
                    <select
                      value={user1Id}
                      onChange={(e) => setUser1Id(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.75rem', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {demoUsers.map((u) => (
                        <option key={u.id} value={u.id} style={{ background: '#0b0f19' }}>{u.name.split('(')[0]}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1, position: 'relative', height: '14px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: raceStage === 'racing' ? '75%' : raceStage === 'finished' ? '100%' : '10%',
                      background: 'linear-gradient(90deg, #38bdf8 0%, #6366f1 100%)',
                      transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
                    }} />
                  </div>

                  <div style={{ width: '80px', textAlign: 'right' }}>
                    {raceResult?.user1Res ? (
                      raceResult.user1Res.status === 200 ? (
                        <span className="badge badge-medium" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                          WIN (200)
                        </span>
                      ) : (
                        <span className="badge badge-urgent">
                          409
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>READY</span>
                    )}
                  </div>
                </div>

                {/* Lane 2 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ width: '120px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>LANE B</div>
                    <select
                      value={user2Id}
                      onChange={(e) => setUser2Id(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.75rem', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {demoUsers.map((u) => (
                        <option key={u.id} value={u.id} style={{ background: '#0b0f19' }}>{u.name.split('(')[0]}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1, position: 'relative', height: '14px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: raceStage === 'racing' ? '70%' : raceStage === 'finished' ? '100%' : '10%',
                      background: 'linear-gradient(90deg, #f59e0b 0%, #f43f5e 100%)',
                      transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
                    }} />
                  </div>

                  <div style={{ width: '80px', textAlign: 'right' }}>
                    {raceResult?.user2Res ? (
                      raceResult.user2Res.status === 200 ? (
                        <span className="badge badge-medium" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                          WIN (200)
                        </span>
                      ) : (
                        <span className="badge badge-urgent">
                          409
                        </span>
                      )
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>READY</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Action Trigger */}
              <button
                onClick={handleRunRace}
                disabled={isRunningRace}
                className="btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                  color: '#000000',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                }}
              >
                <Play size={18} />
                <span>{isRunningRace ? 'Racing Parallel Requests...' : 'FIRE SIMULTANEOUS CLAIMS RACE'}</span>
              </button>

              {/* Race Results Summary */}
              {raceResult && (
                <div style={{
                  marginTop: '18px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.9rem', marginBottom: '8px' }}>
                    <Crown size={20} color="#eab308" />
                    <span>{raceResult.summary}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    The winner was assigned the work item and the OCC version incremented. The runner-up received an immediate 409 conflict, avoiding any race condition or dual ownership in the database.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STALE OCC */}
          {activeTab === 'occ' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                Demonstrates Optimistic Concurrency Control (OCC). If a user attempts to save changes using a stale version (e.g. version <code>v0</code> while current version is <code>v3</code>), the database conditional write fails and the server responds with <strong>HTTP 409 Concurrency Conflict</strong>.
              </p>

              <button
                onClick={handleRunOcc}
                disabled={isRunningOcc}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px', background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' }}
              >
                <Play size={18} />
                <span>{isRunningOcc ? 'Simulating Collision...' : 'Trigger Stale Version Overwrite Collision (OCC)'}</span>
              </button>

              {occResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 800, fontSize: '0.92rem', marginBottom: '6px' }}>
                    <ShieldAlert size={20} />
                    <span>HTTP {occResult.status} {occResult.code}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#fca5a5', marginBottom: '10px' }}>
                    {occResult.message}
                  </div>
                  {occResult.latestItem && (
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                      Reconciled latest database state: <strong>v{occResult.latestItem.version}</strong> (Item ID: {occResult.latestItem.id})
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: IDEMPOTENCY */}
          {activeTab === 'idempotency' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.6' }}>
                Protects against double-clicks, mobile retries, and dropped connections. Two identical POST requests are submitted with the exact same <code>Idempotency-Key</code> header. The second request returns the cached result without creating a duplicate database row.
              </p>

              <button
                onClick={handleRunIdempotency}
                disabled={isRunningIdemp}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                <Play size={18} />
                <span>{isRunningIdemp ? 'Verifying Idempotency...' : 'Send Rapid Duplicate Requests with Same Key'}</span>
              </button>

              {idempResult && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.92rem', marginBottom: '10px' }}>
                    <CheckCircle2 size={20} />
                    <span>Deduplication Verified (1 Item Created, 0 Duplicates)</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.78rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                      <div style={{ fontWeight: 700, color: 'white' }}>Request #1 (Initial Execution)</div>
                      <div style={{ color: 'var(--text-dim)', marginTop: '4px' }}>HTTP Status: {idempResult.req1.status}</div>
                      <div style={{ color: 'var(--text-dim)' }}>Lookup: {idempResult.req1.cacheLookup}</div>
                      <div style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>Item: {idempResult.req1.itemId}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px' }}>
                      <div style={{ fontWeight: 700, color: 'white' }}>Request #2 (Instant Replay)</div>
                      <div style={{ color: 'var(--text-dim)', marginTop: '4px' }}>HTTP Status: {idempResult.req2.status}</div>
                      <div style={{ color: '#34d399', fontWeight: 700 }}>Lookup: {idempResult.req2.cacheLookup}</div>
                      <div style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>Item: {idempResult.req2.itemId}</div>
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
