import React from 'react';
import { WorkItem, WorkItemStatus } from '../types';
import { Clock, UserCheck, AlertTriangle, UserPlus, ArrowRight, CheckCircle2 } from 'lucide-react';

interface KanbanBoardProps {
  items: WorkItem[];
  onItemClick: (item: WorkItem) => void;
  onQuickClaim: (e: React.MouseEvent, item: WorkItem) => void;
  onQuickTransition: (e: React.MouseEvent, item: WorkItem, targetStatus: WorkItemStatus) => void;
  claimingItemId: string | null;
}

const COLUMNS: { id: WorkItemStatus; label: string; color: string; bg: string }[] = [
  { id: 'OPEN', label: 'Open / Triage', color: '#38bdf8', bg: 'rgba(6, 182, 212, 0.1)' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: '#facc15', bg: 'rgba(234, 179, 8, 0.1)' },
  { id: 'AWAITING_APPROVAL', label: 'Awaiting Lead Approval', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.12)' },
  { id: 'RESOLVED', label: 'Resolved', color: '#34d399', bg: 'rgba(16, 185, 129, 0.1)' },
  { id: 'CLOSED', label: 'Closed / Archived', color: '#94a3b8', bg: 'rgba(100, 116, 139, 0.1)' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  items,
  onItemClick,
  onQuickClaim,
  onQuickTransition,
  claimingItemId,
}) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(280px, 1fr))',
      gap: '16px',
      overflowX: 'auto',
      paddingBottom: '20px',
    }}>
      {COLUMNS.map((col) => {
        const columnItems = items.filter((i) => i.status === col.id);

        return (
          <div
            key={col.id}
            style={{
              background: 'rgba(15, 23, 42, 0.45)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '600px',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
            }}
          >
            {/* Column Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(11, 15, 25, 0.4)',
              borderTopLeftRadius: '14px',
              borderTopRightRadius: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  {col.label}
                </span>
              </div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: col.bg,
                color: col.color,
                fontFamily: 'var(--font-mono)',
              }}>
                {columnItems.length}
              </span>
            </div>

            {/* Column Items */}
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
              {columnItems.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                  No items in this stage
                </div>
              ) : (
                columnItems.map((item) => {
                  const glowClass =
                    item.priority === 'URGENT'
                      ? 'card-urgent-glow'
                      : item.priority === 'HIGH'
                      ? 'card-high-glow'
                      : item.priority === 'MEDIUM'
                      ? 'card-medium-glow'
                      : 'card-low-glow';

                  return (
                    <div
                      key={item.id}
                      onClick={() => onItemClick(item)}
                      className={`glass-card ${glowClass}`}
                      style={{
                        padding: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      {/* Top Meta */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)',
                        }}>
                          {item.team_name?.split(' ')[0]}
                        </span>
                        <span className={`badge badge-${item.priority.toLowerCase()}`} style={{ fontSize: '0.65rem' }}>
                          {item.priority}
                        </span>
                      </div>

                      {/* Title */}
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc', lineHeight: '1.35' }}>
                        {item.title}
                      </div>

                      {/* Footer & Actions */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-subtle)',
                        fontSize: '0.72rem',
                      }}>
                        {item.assignee_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                            <UserCheck size={12} color="#10b981" />
                            <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.assignee_name?.split(' ')[0]}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => onQuickClaim(e, item)}
                            disabled={claimingItemId === item.id}
                            style={{
                              background: 'rgba(99, 102, 241, 0.2)',
                              border: '1px solid rgba(99, 102, 241, 0.4)',
                              color: '#c7d2fe',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <UserPlus size={11} />
                            <span>Claim</span>
                          </button>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                          <span style={{ background: 'rgba(255,255,255,0.04)', padding: '1px 4px', borderRadius: '3px' }}>
                            v{item.version}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
