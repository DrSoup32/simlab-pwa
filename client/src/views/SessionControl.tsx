// client/src/views/SessionControl.tsx
import React, { useState, useEffect } from 'react'
import { useSession } from '../contexts/SessionContext'
import { SessionProvider } from '../contexts/SessionContext'

// Import the focused control components we'll create
import SessionHeader from '../components/control/SessionHeader'
import SessionParticipants from '../components/control/SessionParticipants'
import SessionControls from '../components/control/SessionControls'
import SessionChat from '../components/control/SessionChat'
import SessionNotes from '../components/control/SessionNotes'
import SessionManager from '../components/control/SessionManager'
// TODO: Create these remaining components
// import AssetManager from '../components/control/AssetManager'
// import StageManager from '../components/control/StageManager'
// import TimelineViewer from '../components/control/TimelineViewer'
// import OrderManager from '../components/control/OrderManager'
// import PearlManager from '../components/control/PearlManager'

// Error boundary for the control interface
function ControlErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Control error:', error)
      setHasError(true)
    }

    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (hasError) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center',
        fontFamily: 'system-ui'
      }}>
        <h2>Something went wrong</h2>
        <p>Please refresh the page or return to the lobby.</p>
        <button 
          onClick={() => window.location.href = '/#/'}
          style={{
            padding: '8px 16px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Return to Lobby
        </button>
      </div>
    )
  }

  return <>{children}</>
}

// Main Control Component (now much cleaner!)
function SessionControlInner() {
  const { 
    currentSession, 
    currentUser, 
    isConnected, 
    canControlSession,
    error,
    clearError 
  } = useSession()

  const [activePanel, setActivePanel] = useState<'chat' | 'notes' | 'assets' | 'stage' | 'timeline' | 'orders' | 'pearls'>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Show loading state only if not connected or no current user
  if (!isConnected || !currentUser) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'system-ui'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '16px' }}>Connecting...</div>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }} />
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center',
        fontFamily: 'system-ui'
      }}>
        <h2 style={{ color: '#dc3545' }}>Session Error</h2>
        <p>{error}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button 
            onClick={clearError}
            style={{
              padding: '8px 16px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
          <button 
            onClick={() => window.location.href = '/#/'}
            style={{
              padding: '8px 16px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    )
  }

  // Show session manager if no active session
  if (!currentSession) {
    return (
      <div style={{
        fontFamily: 'system-ui',
        background: '#f8f9fa',
        minHeight: '100vh'
      }}>
        <SessionManager />
      </div>
    )
  }

  return (
    <div style={{ 
      fontFamily: 'system-ui', 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8f9fa'
    }}>
      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Session Header */}
      <SessionHeader />

      {/* Main Content Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex',
        overflow: 'hidden'
      }}>
        {/* Left Sidebar - Participants & Controls */}
        <div style={{ 
          width: sidebarCollapsed ? '60px' : '320px',
          background: 'white',
          borderRight: '1px solid #e9ecef',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.3s ease'
        }}>
          {/* Sidebar Toggle */}
          <div style={{ 
            padding: '12px',
            borderBottom: '1px solid #e9ecef',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            {!sidebarCollapsed && <span style={{ fontWeight: 600 }}>Session Info</span>}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                padding: '4px 8px',
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {sidebarCollapsed ? '→' : '←'}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Session Controls */}
              <SessionControls />
              
              {/* Participants */}
              <SessionParticipants />
            </>
          )}
        </div>

        {/* Main Panel Area */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Panel Navigation */}
          <div style={{ 
            background: 'white',
            borderBottom: '1px solid #e9ecef',
            padding: '0 20px',
            display: 'flex',
            gap: '20px'
          }}>
            {[
              { key: 'chat', label: 'Chat', icon: '💬' },
              { key: 'notes', label: 'Notes', icon: '📝' },
              { key: 'assets', label: 'Assets', icon: '📁' },
              { key: 'stage', label: 'Stage', icon: '🎭' },
              { key: 'timeline', label: 'Timeline', icon: '📅' },
              { key: 'orders', label: 'Orders', icon: '🧪' },
              { key: 'pearls', label: 'Pearls', icon: '💎' }
            ].map(panel => (
              <button
                key={panel.key}
                onClick={() => setActivePanel(panel.key as any)}
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activePanel === panel.key ? '3px solid #007bff' : '3px solid transparent',
                  cursor: 'pointer',
                  fontWeight: activePanel === panel.key ? 600 : 400,
                  color: activePanel === panel.key ? '#007bff' : '#6c757d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>{panel.icon}</span>
                {panel.label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div style={{ 
            flex: 1, 
            overflow: 'auto'
          }}>
            {activePanel === 'chat' && <SessionChat />}
            {activePanel === 'notes' && <SessionNotes />}
            {activePanel === 'assets' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Asset Manager - Coming Soon
              </div>
            )}
            {activePanel === 'stage' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Stage Manager - Coming Soon
              </div>
            )}
            {activePanel === 'timeline' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Timeline Viewer - Coming Soon
              </div>
            )}
            {activePanel === 'orders' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Order Manager - Coming Soon
              </div>
            )}
            {activePanel === 'pearls' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Pearl Manager - Coming Soon
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Wrapped component with providers
export default function SessionControl() {
  return (
    <ControlErrorBoundary>
      <SessionProvider>
        <SessionControlInner />
      </SessionProvider>
    </ControlErrorBoundary>
  )
}