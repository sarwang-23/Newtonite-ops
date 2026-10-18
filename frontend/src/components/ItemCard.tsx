import React from 'react';
import { WorkItem, WorkItemPriority, WorkItemStatus } from '../types';
import { UserCheck, Clock, GitCommit, UserPlus, AlertTriangle } from 'lucide-react';

interface ItemCardProps {
  item: WorkItem;
  onClick: (item: WorkItem) => void;
  onQuickClaim: (e: React.MouseEvent, item: WorkItem) => void;
  isClaiming: boolean;
  canClaim: boolean;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onClick,
  onQuickClaim,
  isClaiming,
  canClaim,
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
    <div
      onClick={() => onClick(item)}
      className="glass-card"
      style={{
        padding: '16px 20px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Header: Team, Type & Priority Badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}>
            {item.team_name || item.team_id}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'lowercase' }}>
            #{item.type.toLowerCase().replace('_', ' ')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {getPriorityBadge(item.priority)}
          {getStatusBadge(item.status)}
        </div>
      </div>

      {/* Main Content: Title & Description snippet */}
      <div>
        <h3 style={{
          fontSize: '0.98rem',
          fontWeight: 700,
          color: '#f8fafc',
          marginBottom: '6px',
          lineHeight: '1.4',
        }}>
          {item.title}
        </h3>
        <p style={{
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '1.5',
        }}>
          {item.description}
        </p>
      </div>

      {/* Bottom Footer: Assignee, Version, and Timestamp */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '10px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {item.assignee_id ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
              <UserCheck size={14} color="#10b981" />
              <span>{item.assignee_name || 'Assigned'}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#fbbf24', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={13} color="#f59e0b" />
                Unassigned
              </span>
              {canClaim && (
                <button
                  onClick={(e) => onQuickClaim(e, item)}
                  disabled={isClaiming}
                  style={{
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#c7d2fe',
                    padding: '2px 8px',
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
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          <span title="Optimistic Concurrency Version" style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
            v{item.version}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};
