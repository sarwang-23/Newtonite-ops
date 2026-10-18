import React, { useState, useEffect } from 'react';
import { AuthenticatedUser, OutboxStats, Team, WorkItem, WorkItemStatus } from './types';
import { api, getStoredToken, getStoredUser, storeAuth } from './api';
import { Navbar } from './components/Navbar';
import { OperationsHUD } from './components/OperationsHUD';
import { DashboardViews } from './components/DashboardViews';
import { ItemCard } from './components/ItemCard';
import { KanbanBoard } from './components/KanbanBoard';
import { ItemTableView } from './components/ItemTableView';
import { ItemDetailModal } from './components/ItemDetailModal';
import { CreateItemModal } from './components/CreateItemModal';
import { ConcurrencyLabModal } from './components/ConcurrencyLabModal';
import { ChevronDown, RefreshCw, Sparkles, Inbox } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(getStoredUser());
  const [demoUsers, setDemoUsers] = useState<(AuthenticatedUser & { token: string })[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  
  // Dashboard view & filter state
  const [activeView, setActiveView] = useState('all');
  const [activeLayout, setActiveLayout] = useState<'kanban' | 'grid' | 'table'>('kanban');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Work items & pagination
  const [items, setItems] = useState<WorkItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Outbox stats & polling
  const [outboxStats, setOutboxStats] = useState<OutboxStats | null>(null);
  const [isFlushingOutbox, setIsFlushingOutbox] = useState(false);

  // Modals
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Initial load & auto-login demo account if not logged in
  useEffect(() => {
    const initialize = async () => {
      try {
        const demoRes = await api.getDemoUsers();
        setDemoUsers(demoRes.users);

        if (!getStoredToken() || !currentUser) {
          const defaultUser = demoRes.users.find((u) => u.email === 'lead.eng@newtonite.internal') || demoRes.users[0];
          if (defaultUser) {
            storeAuth(defaultUser.token, defaultUser);
            setCurrentUser(defaultUser);
          }
        }

        const teamRes = await api.getTeams();
        setTeams(teamRes.teams);
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    initialize();
  }, []);

  // Poll outbox stats every 4s
  useEffect(() => {
    const pollOutbox = async () => {
      try {
        const res = await api.getOutboxStats();
        setOutboxStats(res.stats);
      } catch {
        // ignore background poll errors
      }
    };
    pollOutbox();
    const timer = setInterval(pollOutbox, 4000);
    return () => clearInterval(timer);
  }, []);

  // Fetch items on filter / search / view change
  const fetchItems = async (isReset = true) => {
    if (!currentUser) return;
    if (isReset) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const res = await api.listItems({
        team_id: selectedTeam || undefined,
        status: selectedStatus || undefined,
        priority: selectedPriority || undefined,
        view: activeView,
        q: searchQuery || undefined,
        cursor: isReset ? undefined : nextCursor || undefined,
        limit: activeLayout === 'kanban' ? 50 : 20,
      });

      if (isReset) {
        setItems(res.items);
      } else {
        setItems((prev) => [...prev, ...res.items]);
      }

      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.error('Fetch items error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchItems(true);
  }, [currentUser, activeView, selectedTeam, selectedStatus, selectedPriority, searchQuery, activeLayout]);

  // Handle User switch
  const handleSwitchUser = (user: AuthenticatedUser, token: string) => {
    storeAuth(token, user);
    setCurrentUser(user);
    showToast(`Active persona: ${user.name}`);
  };

  // Handle Quick Claim
  const handleQuickClaim = async (e: React.MouseEvent, item: WorkItem) => {
    e.stopPropagation();
    setClaimingItemId(item.id);
    try {
      const updated = await api.claimItem(item.id);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      showToast(`⚡ Atomic Claim registered: "${item.title.slice(0, 30)}..."`);
      const statsRes = await api.getOutboxStats();
      setOutboxStats(statsRes.stats);
    } catch (err: any) {
      showToast(`⚠️ Claim Conflict: ${err.message}`);
    } finally {
      setClaimingItemId(null);
    }
  };

  // Handle Quick Transition
  const handleQuickTransition = async (e: React.MouseEvent, item: WorkItem, targetStatus: WorkItemStatus) => {
    e.stopPropagation();
    try {
      const updated = await api.transitionItem(item.id, {
        status: targetStatus,
        version: item.version,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      showToast(`Workflow status moved to ${targetStatus}`);
    } catch (err: any) {
      showToast(`Transition failed: ${err.message}`);
    }
  };

  // Flush Outbox
  const handleFlushOutbox = async () => {
    setIsFlushingOutbox(true);
    try {
      const res = await api.flushOutbox();
      const statsRes = await api.getOutboxStats();
      setOutboxStats(statsRes.stats);
      showToast(`Outbox Flushed: ${res.result.processed} jobs processed, ${res.result.failures} failures`);
    } catch (err: any) {
      showToast(`Flush error: ${err.message}`);
    } finally {
      setIsFlushingOutbox(false);
    }
  };

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <RefreshCw className="animate-spin" size={32} color="#6366f1" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 20px',
          borderRadius: '12px',
          background: 'rgba(17, 24, 39, 0.95)',
          border: '1px solid rgba(99, 102, 241, 0.5)',
          color: '#f8fafc',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.25)',
          fontSize: '0.84rem',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(12px)',
        }}>
          <Sparkles size={16} color="#6366f1" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        demoUsers={demoUsers}
        onSwitchUser={handleSwitchUser}
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenLab={() => setIsLabOpen(true)}
        outboxStats={outboxStats}
        onFlushOutbox={handleFlushOutbox}
        isFlushing={isFlushingOutbox}
      />

      {/* Main Cockpit Container */}
      <main style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px', flex: 1 }}>
        
        {/* Operations HUD Stat Row & View Switcher */}
        <OperationsHUD
          items={items}
          outboxStats={outboxStats}
          activeLayout={activeLayout}
          onLayoutChange={setActiveLayout}
          onFlushOutbox={handleFlushOutbox}
          isFlushing={isFlushingOutbox}
        />

        {/* Dashboard Quick Views & Filters */}
        <DashboardViews
          activeView={activeView}
          onViewChange={setActiveView}
          teams={teams}
          selectedTeam={selectedTeam}
          onSelectTeam={setSelectedTeam}
          selectedStatus={selectedStatus}
          onSelectStatus={setSelectedStatus}
          selectedPriority={selectedPriority}
          onSelectPriority={setSelectedPriority}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Content Views */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '90px 0', gap: '12px', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={24} color="#6366f1" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Executing indexed query & server filtering...</span>
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '16px',
            border: '1px dashed var(--border-medium)',
          }}>
            <Inbox size={44} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              No operational work items found
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px' }}>
              No items match your active filters or permissions for this view. Try resetting your filters or creating a new work item.
            </p>
            <button onClick={() => setIsCreateOpen(true)} className="btn-primary" style={{ margin: '0 auto' }}>
              Create Work Item
            </button>
          </div>
        ) : (
          <div>
            {/* 1. Kanban Board View */}
            {activeLayout === 'kanban' && (
              <KanbanBoard
                items={items}
                onItemClick={(i) => setSelectedItem(i)}
                onQuickClaim={handleQuickClaim}
                onQuickTransition={handleQuickTransition}
                claimingItemId={claimingItemId}
              />
            )}

            {/* 2. Grid Cards View */}
            {activeLayout === 'grid' && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '16px',
              }}>
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onClick={(i) => setSelectedItem(i)}
                    onQuickClaim={handleQuickClaim}
                    isClaiming={claimingItemId === item.id}
                    canClaim={true}
                  />
                ))}
              </div>
            )}

            {/* 3. Linear Table View */}
            {activeLayout === 'table' && (
              <ItemTableView
                items={items}
                onItemClick={(i) => setSelectedItem(i)}
                onQuickClaim={handleQuickClaim}
                claimingItemId={claimingItemId}
              />
            )}

            {/* Keyset Cursor Pagination */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <button
                  onClick={() => fetchItems(false)}
                  disabled={isLoadingMore}
                  className="btn-secondary"
                  style={{ padding: '10px 24px', fontSize: '0.85rem' }}
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      <span>Loading next cursor page...</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} />
                      <span>Load More Items (Cursor Keyset Pagination)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          currentUser={currentUser}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={(updated) => {
            setSelectedItem(updated);
            setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          }}
        />
      )}

      {/* Create Work Item Modal */}
      {isCreateOpen && (
        <CreateItemModal
          currentUser={currentUser}
          teams={teams}
          onClose={() => setIsCreateOpen(false)}
          onItemCreated={(created) => {
            setItems((prev) => [created, ...prev]);
            showToast(`Work item "${created.title}" created successfully!`);
          }}
        />
      )}

      {/* Concurrency Stress Test Lab */}
      {isLabOpen && (
        <ConcurrencyLabModal
          demoUsers={demoUsers}
          items={items}
          onClose={() => setIsLabOpen(false)}
          onRefreshData={() => fetchItems(true)}
        />
      )}
    </div>
  );
};

export default App;
