import React, { useState, useEffect } from 'react';
import { AuthenticatedUser, OutboxStats, Team, WorkItem } from './types';
import { api, clearAuth, getStoredToken, getStoredUser, storeAuth } from './api';
import { Navbar } from './components/Navbar';
import { DashboardViews } from './components/DashboardViews';
import { ItemCard } from './components/ItemCard';
import { ItemDetailModal } from './components/ItemDetailModal';
import { CreateItemModal } from './components/CreateItemModal';
import { ConcurrencyLabModal } from './components/ConcurrencyLabModal';
import { AlertCircle, ChevronDown, RefreshCw, Sparkles, Inbox } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(getStoredUser());
  const [demoUsers, setDemoUsers] = useState<(AuthenticatedUser & { token: string })[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  
  // Dashboard view & filter state
  const [activeView, setActiveView] = useState('all');
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
          // Default to Elena Vance (Engineering Lead)
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

  // Poll outbox stats every 5s
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
    const timer = setInterval(pollOutbox, 5000);
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
        limit: 15,
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
  }, [currentUser, activeView, selectedTeam, selectedStatus, selectedPriority, searchQuery]);

  // Handle User switch
  const handleSwitchUser = (user: AuthenticatedUser, token: string) => {
    storeAuth(token, user);
    setCurrentUser(user);
    showToast(`Switched active persona to ${user.name}`);
  };

  // Handle Quick Claim
  const handleQuickClaim = async (e: React.MouseEvent, item: WorkItem) => {
    e.stopPropagation();
    setClaimingItemId(item.id);
    try {
      const updated = await api.claimItem(item.id);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      showToast(`Successfully claimed "${item.title}"`);
      // Update outbox stats
      const statsRes = await api.getOutboxStats();
      setOutboxStats(statsRes.stats);
    } catch (err: any) {
      showToast(`Claim failed: ${err.message}`);
    } finally {
      setClaimingItemId(null);
    }
  };

  // Flush Outbox
  const handleFlushOutbox = async () => {
    setIsFlushingOutbox(true);
    try {
      const res = await api.flushOutbox();
      const statsRes = await api.getOutboxStats();
      setOutboxStats(statsRes.stats);
      showToast(`Outbox flushed: ${res.result.processed} jobs processed, ${res.result.failures} failures`);
    } catch (err: any) {
      showToast(`Flush failed: ${err.message}`);
    } finally {
      setIsFlushingOutbox(false);
    }
  };

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <RefreshCw className="animate-spin" size={32} color="#6366f1" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'rgba(30, 41, 59, 0.95)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          color: '#f8fafc',
          boxShadow: 'var(--shadow-lg)',
          fontSize: '0.82rem',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backdropFilter: 'blur(8px)',
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

      {/* Main Container */}
      <main style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px', flex: 1 }}>
        
        {/* Controls & Preset Views */}
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

        {/* Content Area */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '10px', color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={24} color="#6366f1" />
            <span style={{ fontSize: '0.9rem' }}>Loading work items with server-side filters...</span>
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '16px',
            border: '1px dashed var(--border-subtle)',
          }}>
            <Inbox size={42} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              No operational items found
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
            {/* Grid of Work Items */}
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

            {/* Load More Pagination (Keyset / Cursor-Based) */}
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
