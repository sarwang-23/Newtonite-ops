import React from 'react';
import { OutboxStats, WorkItem } from '../types';
import {
  Flame,
  AlertOctagon,
  Clock,
  ShieldCheck,
  LayoutGrid,
  Columns3,
  List,
  RefreshCw,
  Activity,
  Layers,
} from 'lucide-react';

interface OperationsHUDProps {
  items: WorkItem[];
  outboxStats: OutboxStats | null;
  activeLayout: 'kanban' | 'grid' | 'table';
  onLayoutChange: (layout: 'kanban' | 'grid' | 'table') => void;
  onFlushOutbox: () => void;
  isFlushing: boolean;
}

export const OperationsHUD: React.FC<OperationsHUDProps> = ({
  items,
  outboxStats,
  activeLayout,
  onLayoutChange,
  onFlushOutbox,
  isFlushing,
}) => {
  const urgentCount = items.filter((i) => i.priority === 'URGENT' && i.status !== 'CLOSED').length;
  const awaitingCount = items.filter((i) => i.status === 'AWAITING_APPROVAL').length;
  const unassignedCount = items.filter((i) => !i.assignee_id && i.status !== 'CLOSED').length;

  // Pressure Gauge Logic
  const pressureLevel = urgentCount > 0 ? 'CRITICAL' : unassignedCount > 5 ? 'ELEVATED' : 'STABLE';
  const pressureColor = pressureLevel === 'CRITICAL' ? '#f43f5e' : pressureLevel === 'ELEVATED' ? '#f59e0b' : '#10b981';

  return (
    <div style={{ marginBottom: '24px' }}>
      
      {/* Top Cockpit Title & View Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderRadius: '20px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: `1px solid ${pressureColor}40`,
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: pressureColor,
              display: 'inline-block',
            }} className={pressureLevel === 'CRITICAL' ? 'animate-pulse-red' : 'animate-pulse-live'} />
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: pressureColor, letterSpacing: '0.05em' }}>
              PRESSURE: {pressureLevel}
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            High-Concurrency Workstream Dispatcher
          </div>
        </div>

        {/* Layout Mode Toggles (Kanban vs Grid vs Table) */}
        <div style={{
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '3px',
          gap: '2px',
        }}>
          <button
            onClick={() => onLayoutChange('kanban')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeLayout === 'kanban' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeLayout === 'kanban' ? '#a5b4fc' : 'var(--text-dim)',
              transition: 'all 0.15s ease',
            }}
          >
            <Columns3 size={14} />
            <span>Kanban Board</span>
          </button>

          <button
            onClick={() => onLayoutChange('grid')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeLayout === 'grid' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeLayout === 'grid' ? '#a5b4fc' : 'var(--text-dim)',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={14} />
            <span>Feed Cards</span>
          </button>

          <button
            onClick={() => onLayoutChange('table')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeLayout === 'table' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeLayout === 'table' ? '#a5b4fc' : 'var(--text-dim)',
              transition: 'all 0.15s ease',
            }}
          >
            <List size={14} />
            <span>Linear List</span>
          </button>
        </div>
      </div>

      {/* 4 Futuristic HUD Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '14px',
      }}>
        
        {/* Card 1: Total Operational Items */}
        <div className="hud-metric-card" data-color="indigo" style={{ borderLeft: '3px solid #6366f1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              TRACKED ITEMS
            </span>
            <Layers size={16} color="#6366f1" style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.7))' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-number" style={{ fontSize: '2rem', fontWeight: 800, color: '#a5b4fc' }}>
              {items.length}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              ({unassignedCount} unassigned)
            </span>
          </div>
        </div>

        {/* Card 2: Urgent Incidents */}
        <div className="hud-metric-card" data-color="rose" style={{ borderLeft: '3px solid #ff2d55', boxShadow: urgentCount > 0 ? 'var(--shadow-neon-red)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              URGENT SEVERITY
            </span>
            <Flame size={16} color="#ff2d55" style={{ filter: 'drop-shadow(0 0 6px rgba(255,45,85,0.7))' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-number" style={{ fontSize: '2rem', fontWeight: 800, color: '#ff6b8a' }}>
              {urgentCount}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>
              {urgentCount > 0 ? 'Immediate action required' : 'Clear of critical fire drills'}
            </span>
          </div>
        </div>

        {/* Card 3: Awaiting Lead Approval */}
        <div className="hud-metric-card" data-color="purple" style={{ borderLeft: '3px solid #b44dff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              AWAITING LEAD SIGN-OFF
            </span>
            <Clock size={16} color="#b44dff" style={{ filter: 'drop-shadow(0 0 6px rgba(180,77,255,0.7))' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-number" style={{ fontSize: '2rem', fontWeight: 800, color: '#c97fff' }}>
              {awaitingCount}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              Lead role verification gate
            </span>
          </div>
        </div>

        {/* Card 4: Transactional Outbox Engine */}
        <div className="hud-metric-card" data-color="emerald" style={{ borderLeft: '3px solid #00ffaa' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              OUTBOX ASYNC WORKER
            </span>
            <button
              onClick={onFlushOutbox}
              disabled={isFlushing}
              style={{
                background: 'rgba(0,255,170,0.12)',
                border: '1px solid rgba(0,255,170,0.3)',
                borderRadius: '5px',
                padding: '2px 8px',
                color: '#33ffb8',
                cursor: 'pointer',
                fontSize: '0.67rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
              }}
              title="Force process pending outbox queue"
            >
              <RefreshCw size={11} className={isFlushing ? 'animate-spin' : ''} />
              <span>Flush</span>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stat-number" style={{ fontSize: '2rem', fontWeight: 800, color: '#33ffb8' }}>
              {outboxStats ? outboxStats.completed : 0}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              jobs done {outboxStats?.pending ? `(${outboxStats.pending} pending)` : ''}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
