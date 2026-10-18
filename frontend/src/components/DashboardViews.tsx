import React from 'react';
import { Team } from '../types';
import { Search, Filter, AlertCircle, Clock, CheckCircle2, UserCheck, Layers } from 'lucide-react';

interface DashboardViewsProps {
  activeView: string;
  onViewChange: (view: string) => void;
  teams: Team[];
  selectedTeam: string;
  onSelectTeam: (teamId: string) => void;
  selectedStatus: string;
  onSelectStatus: (status: string) => void;
  selectedPriority: string;
  onSelectPriority: (priority: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const DashboardViews: React.FC<DashboardViewsProps> = ({
  activeView,
  onViewChange,
  teams,
  selectedTeam,
  onSelectTeam,
  selectedStatus,
  onSelectStatus,
  selectedPriority,
  onSelectPriority,
  searchQuery,
  onSearchChange,
}) => {
  const views = [
    { id: 'all', label: 'All Items', icon: <Layers size={15} /> },
    { id: 'assigned_to_me', label: 'Assigned to Me', icon: <UserCheck size={15} /> },
    { id: 'unassigned_urgent', label: 'Unassigned Urgent', icon: <AlertCircle size={15} /> },
    { id: 'awaiting_approval', label: 'Awaiting Approval', icon: <Clock size={15} /> },
  ];

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Top View Selector Pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {views.map((v) => {
            const isActive = activeView === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onViewChange(v.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid var(--border-subtle)',
                  background: isActive ? 'rgba(99, 102, 241, 0.18)' : 'var(--bg-surface)',
                  color: isActive ? '#a5b4fc' : 'var(--text-muted)',
                  boxShadow: isActive ? '0 0 15px rgba(99, 102, 241, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Search input */}
        <div style={{ position: 'relative', minWidth: '280px', flex: '1', maxWidth: '400px' }}>
          <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search titles, descriptions (server-side index)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Filter Row: Team, Status, Priority */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '12px 16px',
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600 }}>
          <Filter size={14} />
          <span>FILTERS:</span>
        </div>

        {/* Team Dropdown */}
        <select
          value={selectedTeam}
          onChange={(e) => onSelectTeam(e.target.value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.78rem',
            outline: 'none',
          }}
        >
          <option value="">All Permitted Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {/* Status Dropdown */}
        <select
          value={selectedStatus}
          onChange={(e) => onSelectStatus(e.target.value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.78rem',
            outline: 'none',
          }}
        >
          <option value="">All Statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="AWAITING_APPROVAL">AWAITING_APPROVAL</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>

        {/* Priority Dropdown */}
        <select
          value={selectedPriority}
          onChange={(e) => onSelectPriority(e.target.value)}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.78rem',
            outline: 'none',
          }}
        >
          <option value="">All Priorities</option>
          <option value="URGENT">URGENT</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>

        {(selectedTeam || selectedStatus || selectedPriority || searchQuery) && (
          <button
            onClick={() => {
              onSelectTeam('');
              onSelectStatus('');
              onSelectPriority('');
              onSearchChange('');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              fontSize: '0.78rem',
              cursor: 'pointer',
              marginLeft: 'auto',
              fontWeight: 600,
            }}
          >
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
};
