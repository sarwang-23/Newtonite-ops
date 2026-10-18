import React, { useState } from 'react';
import { AuthenticatedUser, OutboxStats } from '../types';
import {
  ShieldAlert,
  Users,
  Layers,
  Zap,
  Activity,
  Plus,
  RefreshCw,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface NavbarProps {
  currentUser: AuthenticatedUser;
  demoUsers: (AuthenticatedUser & { token: string })[];
  onSwitchUser: (user: AuthenticatedUser, token: string) => void;
  onOpenCreate: () => void;
  onOpenLab: () => void;
  outboxStats: OutboxStats | null;
  onFlushOutbox: () => void;
  isFlushing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  demoUsers,
  onSwitchUser,
  onOpenCreate,
  onOpenLab,
  outboxStats,
  onFlushOutbox,
  isFlushing,
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Role summary
  const highestRole = currentUser.memberships.reduce((acc, m) => {
    if (m.role === 'ADMIN' || acc === 'ADMIN') return 'ADMIN';
    if (m.role === 'LEAD' || acc === 'LEAD') return 'LEAD';
    if (m.role === 'MEMBER' || acc === 'MEMBER') return 'MEMBER';
    return acc;
  }, 'VIEWER' as string);

  return (
    <header className="glass-panel" style={{ borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 40 }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.5)',
          }}>
            <ShieldAlert size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                NEWTONITE
              </span>
              <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '4px', color: '#a5b4fc', fontWeight: 700 }}>
                OPS UNDER PRESSURE
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Operational Reliability & Concurrency Platform
            </div>
          </div>
        </div>

        {/* Center / Stats & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* Outbox Diagnostics Widget */}
          {outboxStats && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              fontSize: '0.78rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: outboxStats.pending > 0 ? '#f59e0b' : '#10b981', display: 'inline-block' }} />
                <span style={{ color: 'var(--text-muted)' }}>Outbox:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{outboxStats.completed} done</span>
                {outboxStats.pending > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>({outboxStats.pending} pending)</span>
                )}
              </div>
              <button
                onClick={onFlushOutbox}
                disabled={isFlushing}
                title="Process pending outbox jobs immediately"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: isFlushing ? 'wait' : 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                }}
              >
                <RefreshCw size={14} className={isFlushing ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {/* Concurrency Stress Test Lab */}
          <button
            onClick={onOpenLab}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '7px 12px', borderColor: 'rgba(234, 179, 8, 0.4)', color: '#fef08a' }}
          >
            <Zap size={15} color="#eab308" />
            <span>Concurrency Lab</span>
          </button>

          {/* Create Work Item Button */}
          <button onClick={onOpenCreate} className="btn-primary" style={{ fontSize: '0.8rem', padding: '7px 14px' }}>
            <Plus size={16} />
            <span>New Work Item</span>
          </button>
        </div>

        {/* User Persona Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: 'var(--text-main)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: highestRole === 'ADMIN' ? '#6366f1' : highestRole === 'LEAD' ? '#10b981' : '#0ea5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#ffffff',
            }}>
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{currentUser.name.split('(')[0].trim()}</span>
                <span className={`badge ${highestRole === 'ADMIN' ? 'badge-urgent' : highestRole === 'LEAD' ? 'badge-high' : 'badge-medium'}`} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                  {highestRole}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                {currentUser.memberships.map((m) => m.team_name.split(' ')[0]).join(', ')}
              </div>
            </div>
            <ChevronDown size={14} color="var(--text-dim)" />
          </button>

          {/* Demo User Selection Dropdown */}
          {showUserDropdown && (
            <div className="glass-panel" style={{
              position: 'absolute',
              right: 0,
              top: '48px',
              width: '320px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              padding: '8px',
              zIndex: 50,
            }}>
              <div style={{ padding: '8px 10px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '6px' }}>
                SWITCH EVALUATOR PERSONA
              </div>
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {demoUsers.map((u) => {
                  const role = u.memberships.reduce((acc, m) => {
                    if (m.role === 'ADMIN' || acc === 'ADMIN') return 'ADMIN';
                    if (m.role === 'LEAD' || acc === 'LEAD') return 'LEAD';
                    if (m.role === 'MEMBER' || acc === 'MEMBER') return 'MEMBER';
                    return acc;
                  }, 'VIEWER' as string);

                  const isCurrent = u.id === currentUser.id;

                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        onSwitchUser(u, u.token);
                        setShowUserDropdown(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: isCurrent ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isCurrent ? '#a5b4fc' : 'var(--text-main)' }}>
                          {u.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {u.email}
                        </div>
                      </div>
                      <span className={`badge ${role === 'ADMIN' ? 'badge-urgent' : role === 'LEAD' ? 'badge-high' : 'badge-low'}`} style={{ fontSize: '0.65rem' }}>
                        {role}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
