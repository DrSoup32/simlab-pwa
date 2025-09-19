// client/src/components/control/SessionControls.tsx
import React, { useState } from 'react'
import { useSession } from '../../contexts/SessionContext'

export default function SessionControls() {
  const { 
    currentSession, 
    canControlSession,
    startSession,
    pauseSession,
    resumeSession,
    endSession
  } = useSession()

  const [loading, setLoading] = useState<string | null>(null)

  if (!currentSession || !canControlSession()) return null

  const handleSessionAction = async (action: () => Promise<void>, actionName: string) => {
    try {
      setLoading(actionName)
      await action()
    } catch (error) {
      console.error(`Failed to ${actionName}:`, error)
      // Error handling is done by the session context
    } finally {
      setLoading(null)
    }
  }

  const canStart = currentSession.status === 'lobby'
  const canPause = currentSession.status === 'active'
  const canResume = currentSession.status === 'paused'
  const canEnd = currentSession.status === 'active' || currentSession.status === 'paused'

  return (
    <div style={{
      padding: '16px',
      borderBottom: '1px solid #e9ecef'
    }}>
      <h4 style={{ 
        margin: '0 0 12px',
        fontSize: '14px',
        fontWeight: 600,
        color: '#495057'
      }}>
        Session Controls
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Start Session */}
        {canStart && (
          <button
            onClick={() => handleSessionAction(startSession, 'start')}
            disabled={loading === 'start'}
            style={{
              padding: '8px 12px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading === 'start' ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: loading === 'start' ? 0.7 : 1
            }}
          >
            {loading === 'start' ? 'Starting...' : '▶️ Start Session'}
          </button>
        )}

        {/* Pause Session */}
        {canPause && (
          <button
            onClick={() => handleSessionAction(pauseSession, 'pause')}
            disabled={loading === 'pause'}
            style={{
              padding: '8px 12px',
              background: '#fd7e14',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading === 'pause' ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: loading === 'pause' ? 0.7 : 1
            }}
          >
            {loading === 'pause' ? 'Pausing...' : '⏸️ Pause Session'}
          </button>
        )}

        {/* Resume Session */}
        {canResume && (
          <button
            onClick={() => handleSessionAction(resumeSession, 'resume')}
            disabled={loading === 'resume'}
            style={{
              padding: '8px 12px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading === 'resume' ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: loading === 'resume' ? 0.7 : 1
            }}
          >
            {loading === 'resume' ? 'Resuming...' : '▶️ Resume Session'}
          </button>
        )}

        {/* End Session */}
        {canEnd && (
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to end this session? This cannot be undone.')) {
                handleSessionAction(endSession, 'end')
              }
            }}
            disabled={loading === 'end'}
            style={{
              padding: '8px 12px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading === 'end' ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              opacity: loading === 'end' ? 0.7 : 1
            }}
          >
            {loading === 'end' ? 'Ending...' : '⏹️ End Session'}
          </button>
        )}
      </div>

      {/* Session Info */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: '#f8f9fa',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#6c757d'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>Created:</strong> {new Date(currentSession.createdAt).toLocaleDateString()}
        </div>
        {currentSession.startedAt && (
          <div style={{ marginBottom: '4px' }}>
            <strong>Started:</strong> {new Date(currentSession.startedAt).toLocaleTimeString()}
          </div>
        )}
        <div>
          <strong>Session ID:</strong> {currentSession.id}
        </div>
      </div>
    </div>
  )
}