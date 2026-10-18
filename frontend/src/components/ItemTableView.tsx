import React from 'react';
import { WorkItem, WorkItemPriority, WorkItemStatus } from '../types';
import { UserCheck, Clock, UserPlus, AlertTriangle } from 'lucide-react';

interface ItemTableViewProps {
  items: WorkItem[];
  onItemClick: (item: WorkItem) => void;
  onQuickClaim: (e: React.MouseEvent, item: WorkItem) => void;
  claimingItemId: string | null;
}

export const ItemTableView: React.FC<ItemTableViewProps> = ({
  items,
  onItemClick,
  onQuickClaim,
  claimingItemId,
}) => {
  const getPriorityBadge = (p: WorkItemPriority) => {
    switch (p) {
      case 'URGENT':
        return <span className="badge badge-urgent">URGENT</span>;
      case 'HIGH':
        return <span className="badge badge-high">HIGH</span>;
      case 'MEDIUM':
        return <span className="badge badge-medium">MED</span>;
      default:
        return <span className="badge badge-low">LOW</span>;
    }
  };

  const getStatusBadge = (s: WorkItemStatus) => {
    switch (s) {
      case 'OPEN':
        return <span className="badge status-open">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="badge status-in-progress">IN PROGRESS</span>;
      case 'AWAITING_APPROVAL':
        return <span className="badge status-awaiting-approval">AWAITING APPROVAL</span>;
      case 'RESOLVED':
        return <span className="badge status-resolved">RESOLVED</span>;
      case 'CLOSED':
        return <span className="badge status-closed">CLOSED</span>;
    }
  };

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.55)',
      borderRadius: '12px',
      border: '1px solid var(--border-subtle)',
      overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: 'rgba(11, 15, 25, 0.7)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <th style={{ padding: '12px 16px' }}>Identifier & Title</th>
            <th style={{ padding: '12px 16px' }}>Team</th>
            <th style={{ padding: '12px 16px' }}>Status</th>
            <th style={{ padding: '12px 16px' }}>Priority</th>
            <th style={{ padding: '12px 16px' }}>Assignee</th>
            <th style={{ padding: '12px 16px' }}>OCC Version</th>
            <th style={{ padding: '12px 16px' }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.id}
              onClick={() => onItemClick(item)}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(99, 102, 241, 0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent';
              }}
            >
              {/* Title & snippet */}
              <td style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '2px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', maxWidth: '420px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
                </div>
              </td>

              {/* Team */}
              <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                {item.team_name}
              </td>

              {/* Status */}
              <td style={{ padding: '14px 16px' }}>
                {getStatusBadge(item.status)}
              </td>

              {/* Priority */}
              <td style={{ padding: '14px 16px' }}>
                {getPriorityBadge(item.priority)}
              </td>

              {/* Assignee / Quick Claim */}
              <td style={{ padding: '14px 16px' }}>
                {item.assignee_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                    <UserCheck size={14} color="#10b981" />
                    <span>{item.assignee_name || 'Assigned'}</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => onQuickClaim(e, item)}
                    disabled={claimingItemId === item.id}
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#c7d2fe',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <UserPlus size={12} />
                    <span>Claim</span>
                  </button>
                )}
              </td>

              {/* OCC Version */}
              <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                v{item.version}
              </td>

              {/* Timestamp */}
              <td style={{ padding: '14px 16px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
