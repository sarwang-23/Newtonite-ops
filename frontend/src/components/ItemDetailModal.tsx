import React, { useState, useEffect } from 'react';
import {
  ActivityEvent,
  AuthenticatedUser,
  Comment,
  Role,
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
} from '../types';
import { api, ApiError } from '../api';
import {
  X,
  Clock,
  User,
  GitCommit,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Send,
  Edit2,
  Save,
  ShieldAlert,
  Lock,
} from 'lucide-react';

interface ItemDetailModalProps {
  item: WorkItem;
  currentUser: AuthenticatedUser;
  onClose: () => void;
  onItemUpdated: (updatedItem: WorkItem) => void;
}

const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'RESOLVED', 'OPEN'],
  AWAITING_APPROVAL: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['OPEN'],
};

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item: initialItem,
  currentUser,
  onClose,
  onItemUpdated,
}) => {
  const [item, setItem] = useState<WorkItem>(initialItem);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDesc, setEditDesc] = useState(item.description);
  const [editPriority, setEditPriority] = useState<WorkItemPriority>(item.priority);
  const [isSaving, setIsSaving] = useState(false);

  // Transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionComment, setTransitionComment] = useState('');

  // Conflict warning banner state
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // User's role in this item's team
  const userTeamMembership = currentUser.memberships.find((m) => m.team_id === item.team_id);
  const hasGlobalAdmin = currentUser.memberships.some((m) => m.role === 'ADMIN');
  const userRole: Role | null = hasGlobalAdmin ? 'ADMIN' : userTeamMembership ? userTeamMembership.role : null;

  const canMutate = userRole === 'MEMBER' || userRole === 'LEAD' || userRole === 'ADMIN';
  const canApprove = userRole === 'LEAD' || userRole === 'ADMIN';

  // Load activity history & comments
  const loadData = async () => {
    try {
      const [actRes, comRes] = await Promise.all([
        api.getActivity(item.id),
        api.listComments(item.id),
      ]);
      setEvents(actRes.events);
      setComments(comRes.comments);
    } catch (err: any) {
      console.error('Failed to load item details:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [item.id]);

  // Handle Workflow Status Transition
  const handleTransition = async (targetStatus: WorkItemStatus) => {
    setIsTransitioning(true);
    setConflictMessage(null);
    setErrorMessage(null);

    try {
      const updated = await api.transitionItem(item.id, {
        status: targetStatus,
        version: item.version,
        comment: transitionComment || undefined,
      });
      setItem(updated);
      onItemUpdated(updated);
      setTransitionComment('');
      await loadData();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictMessage(err.message);
        if (err.latestItem) {
          setItem(err.latestItem);
          onItemUpdated(err.latestItem);
        }
      } else {
        setErrorMessage(err.message || 'Workflow transition failed');
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  // Handle Claim Item
  const handleClaim = async () => {
    setConflictMessage(null);
    setErrorMessage(null);
    try {
      const updated = await api.claimItem(item.id);
      setItem(updated);
      onItemUpdated(updated);
      await loadData();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictMessage(err.message);
        if (err.latestItem) {
          setItem(err.latestItem);
          onItemUpdated(err.latestItem);
        }
      } else {
        setErrorMessage(err.message || 'Failed to claim item');
      }
    }
  };

  // Handle Optimistic Edit Save
  const handleSaveEdit = async () => {
    setIsSaving(true);
    setConflictMessage(null);
    setErrorMessage(null);

    // Optimistic local update preview
    const previousItem = { ...item };
    setItem({
      ...item,
      title: editTitle,
      description: editDesc,
      priority: editPriority,
    });

    try {
      const updated = await api.updateItem(item.id, {
        title: editTitle,
        description: editDesc,
        priority: editPriority,
        version: previousItem.version,
      });
      setItem(updated);
      onItemUpdated(updated);
      setIsEditing(false);
      await loadData();
    } catch (err: any) {
      // Rollback optimistic state
      setItem(previousItem);

      if (err instanceof ApiError && err.status === 409) {
        setConflictMessage(err.message);
        if (err.latestItem) {
          setItem(err.latestItem);
          setEditTitle(err.latestItem.title);
          setEditDesc(err.latestItem.description);
          setEditPriority(err.latestItem.priority);
          onItemUpdated(err.latestItem);
        }
      } else {
        setErrorMessage(err.message || 'Failed to update work item');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, newComment);
      setNewComment('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const allowedNextStatuses = ALLOWED_TRANSITIONS[item.status] || [];

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
        maxWidth: '900px',
        maxHeight: '90vh',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-accent)',
      }}>
        
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.8rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', fontWeight: 700 }}>
              {item.team_name}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              ID: {item.id}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: '#38bdf8' }}>
              v{item.version} (OCC)
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Concurrency Conflict Banner (if triggered) */}
          {conflictMessage && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              fontSize: '0.85rem',
            }}>
              <ShieldAlert size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: '2px' }}>CONCURRENCY CONFLICT (HTTP 409)</div>
                <div>{conflictMessage}</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#f87171' }}>
                  The work item has been safely rolled back and synchronized to the newest server state (v{item.version}).
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fde047',
              fontSize: '0.85rem',
            }}>
              {errorMessage}
            </div>
          )}

          {/* Title & Description or Edit Mode */}
          {!isEditing ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', lineHeight: '1.3' }}>
                  {item.title}
                </h2>
                {canMutate && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>
                )}
              </div>
              <p style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {item.description || 'No description provided.'}
              </p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a5b4fc', marginBottom: '8px' }}>
                EDIT WORK ITEM (TESTS OPTIMISTIC LOCKING OCC)
              </div>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  marginBottom: '10px',
                }}
              />
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  marginBottom: '10px',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Priority:</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as any)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'white',
                    padding: '6px 10px',
                    borderRadius: '6px',
                  }}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleSaveEdit} disabled={isSaving} className="btn-primary" style={{ fontSize: '0.8rem' }}>
                  <Save size={14} />
                  <span>{isSaving ? 'Checking OCC Version...' : 'Save Changes'}</span>
                </button>
                <button onClick={() => setIsEditing(false)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Workflow Action Control Center */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '12px' }}>
              WORKFLOW STATE TRANSITIONS (SERVER-ENFORCED STATE MACHINE)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Current Status:</span>
                <span className={`badge status-${item.status.toLowerCase().replace('_', '-')}`} style={{ fontSize: '0.85rem', padding: '4px 10px' }}>
                  {item.status}
                </span>
              </div>

              {/* Unassigned Claim Button */}
              {!item.assignee_id && canMutate && (
                <button
                  onClick={handleClaim}
                  className="btn-primary"
                  style={{ fontSize: '0.82rem', padding: '6px 14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  <CheckCircle size={15} />
                  <span>Claim Item (Atomic)</span>
                </button>
              )}

              {/* Transition Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {allowedNextStatuses.map((target) => {
                  const isApproval = item.status === 'AWAITING_APPROVAL' && target === 'RESOLVED';
                  const isLocked = isApproval && !canApprove;

                  return (
                    <button
                      key={target}
                      onClick={() => handleTransition(target)}
                      disabled={isTransitioning || isLocked}
                      className={target === 'RESOLVED' ? 'btn-primary' : 'btn-secondary'}
                      style={{
                        fontSize: '0.78rem',
                        padding: '6px 12px',
                        opacity: isLocked ? 0.4 : 1,
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        borderColor: isApproval ? 'rgba(168, 85, 247, 0.5)' : undefined,
                      }}
                      title={isLocked ? 'Approval transition requires Lead or Admin privileges in this team' : undefined}
                    >
                      {isLocked ? <Lock size={12} /> : <ArrowRight size={13} />}
                      <span>Move to {target}</span>
                      {isApproval && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', background: 'rgba(168, 85, 247, 0.3)', borderRadius: '3px', color: '#e9d5ff' }}>
                          LEAD ONLY
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Transition Note */}
            <input
              type="text"
              placeholder="Optional handover comment or reason for state transition..."
              value={transitionComment}
              onChange={(e) => setTransitionComment(e.target.value)}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '0.78rem',
              }}
            />
          </div>

          {/* Grid: Audit Timeline & Comments */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* Activity History (Immutable Audit Log) */}
            <div style={{
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              padding: '16px',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} color="#6366f1" />
                <span>ACTIVITY HISTORY (TRANSACTIONAL AUDIT LOG)</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '300px', overflowY: 'auto' }}>
                {events.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', gap: '10px', fontSize: '0.78rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1', marginTop: '5px', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {ev.description}
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <span>{ev.user_name || 'System Worker'}</span>
                        <span>•</span>
                        <span>{new Date(ev.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comments Thread */}
            <div style={{
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '14px' }}>
                TEAM COLLABORATION & COMMENTS ({comments.length})
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
                {comments.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    No comments yet. Start the discussion below.
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#c7d2fe' }}>{c.user_name}</span>
                        <span>{new Date(c.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                        {c.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {canMutate ? (
                <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.78rem',
                    }}
                  />
                  <button type="submit" disabled={isSubmittingComment} className="btn-primary" style={{ padding: '8px 12px' }}>
                    <Send size={14} />
                  </button>
                </form>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Viewer accounts cannot post comments.
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
