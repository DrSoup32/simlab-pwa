// client/src/components/control/SessionHeader.tsx
import React from 'react'
import { useSession } from '../../contexts/SessionContext'

export default function SessionHeader() {
  const { currentSession, currentUser, leaveSession } = useSession()

  if (!currentSession || !currentUser) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'lobby': return '#ffc107'
      case 'active': return '#28a745'
      case 'paused': return '#fd7e14'
      case 'completed': return '#6c757d'
      default: return '#6c757d'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'lobby': return 'Waiting to Start'
      case 'active': return 'In Progress'
      case 'paused': return 'Paused'
      case 'completed': return 'Completed'
      default: return 'Unknown'
    }
  }

  const formatDuration = () => {
    if (!currentSession.startedAt) return null
    const end = currentSession.endedAt || Date.now()
    const duration = Math.floor((end - currentSession.startedAt) / 1000 / 60)
    const hours = Math.floor(duration / 60)
    const minutes = duration % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  return (
    <div style={{
      background: 'white',
      borderBottom: '1px solid #e9ecef',
      padding: '16px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      {/* Left side - Session info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Session name and status */}
        <div>
          <h1 style={{ 
            margin: '0 0 4px',
            fontSize: '20px',
            fontWeight: 600
          }}>
            {currentSession.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              background: getStatusColor(currentSession.status) + '20',
              color: getStatusColor(currentSession.status),
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 500
            }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: getStatusColor(currentSession.status)
                }}
              />
              {getStatusLabel(currentSession.status)}
            </div>
            
            <span style={{ fontSize: '14px', color: '#6c757d' }}>
              Case: {currentSession.caseId}
            </span>
            
            {formatDuration() && (
              <span style={{ fontSize: '14px', color: '#6c757d' }}>
                Duration: {formatDuration()}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {currentSession.description && (
          <div style={{
            padding: '8px 12px',
            background: '#f8f9fa',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#6c757d',
            maxWidth: '300px'
          }}>
            {currentSession.description}
          </div>
        )}
      </div>

      {/* Right side - User info and actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Participant count */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          fontSize: '14px',
          color: '#6c757d'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>👨‍⚕️</span>
            <span>{currentSession.faculty.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>👨‍🎓</span>
            <span>{currentSession.learners.length}/{currentSession.settings.maxLearners}</span>
          </div>
          {currentSession.stage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🎭</span>
              <span>1</span>
            </div>
          )}
        </div>

        {/* Current user */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: '#f8f9fa',
          borderRadius: '6px'
        }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: currentUser.avatar 
                ? `url(${currentUser.avatar}) center/cover`
                : '#007bff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            {!currentUser.avatar && currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>
              {currentUser.role}
            </div>
          </div>
        </div>

        {/* Leave session button */}
        <button
          onClick={leaveSession}
          style={{
            padding: '8px 16px',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#c82333'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#dc3545'}
        >
          Leave Session
        </button>
      </div>
    </div>
  )
}