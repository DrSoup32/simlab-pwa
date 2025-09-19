// client/src/components/SessionCard.tsx
import React from 'react'
import { Session, UserProfile } from '../types/session'

interface SessionCardProps {
  session: Session
  currentUser: UserProfile | null
  onJoin: () => void
  onSelect: () => void
}

export default function SessionCard({ session, currentUser, onJoin, onSelect }: SessionCardProps) {
  const getStatusColor = (status: Session['status']) => {
    switch (status) {
      case 'lobby': return '#ffc107'
      case 'active': return '#28a745'
      case 'paused': return '#fd7e14'
      case 'completed': return '#6c757d'
      default: return '#6c757d'
    }
  }

  const getStatusLabel = (status: Session['status']) => {
    switch (status) {
      case 'lobby': return 'Waiting to Start'
      case 'active': return 'In Progress'
      case 'paused': return 'Paused'
      case 'completed': return 'Completed'
      default: return 'Unknown'
    }
  }

  const isUserInSession = () => {
    if (!currentUser) return false
    return session.faculty.some(f => f.userId === currentUser.id) ||
           session.learners.some(l => l.userId === currentUser.id) ||
           session.stage?.userId === currentUser.id
  }

  const canJoin = () => {
    if (!currentUser || isUserInSession()) return false
    if (session.status === 'completed') return false
    if (session.status === 'active' && !session.settings.allowLateJoin) return false
    if (currentUser.role === 'learner') {
      return session.learners.length < session.settings.maxLearners
    }
    return true
  }

  const getUserRole = () => {
    if (!currentUser || !isUserInSession()) return null
    if (session.faculty.some(f => f.userId === currentUser.id)) return 'faculty'
    if (session.learners.some(l => l.userId === currentUser.id)) return 'learner'
    if (session.stage?.userId === currentUser.id) return 'stage'
    return null
  }

  const formatDuration = () => {
    if (!session.startedAt) return null
    const end = session.endedAt || Date.now()
    const duration = Math.floor((end - session.startedAt) / 1000 / 60)
    return `${duration} min`
  }

  return (
    <div
      style={{
        padding: '16px',
        background: 'white',
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.2s'
      }}
      onClick={onSelect}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600 }}>
            {session.name}
          </h4>
          {session.description && (
            <p style={{ margin: '0 0 8px', color: '#6c757d', fontSize: '14px' }}>
              {session.description}
            </p>
          )}
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 6,
          padding: '4px 8px',
          background: getStatusColor(session.status) + '20',
          color: getStatusColor(session.status),
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500
        }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: getStatusColor(session.status)
            }}
          />
          {getStatusLabel(session.status)}
        </div>
      </div>

      {/* Session Info */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '14px' }}>
        <div>
          <span style={{ color: '#6c757d' }}>Case:</span>{' '}
          <span style={{ fontWeight: 500 }}>{session.caseId}</span>
        </div>
        <div>
          <span style={{ color: '#6c757d' }}>Learners:</span>{' '}
          <span style={{ fontWeight: 500 }}>
            {session.learners.length}/{session.settings.maxLearners}
          </span>
        </div>
        {formatDuration() && (
          <div>
            <span style={{ color: '#6c757d' }}>Duration:</span>{' '}
            <span style={{ fontWeight: 500 }}>{formatDuration()}</span>
          </div>
        )}
      </div>

      {/* Participants */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '6px' }}>Participants</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {session.faculty.map(faculty => (
            <div
              key={faculty.userId}
              style={{
                padding: '2px 6px',
                background: '#007bff20',
                color: '#007bff',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 500
              }}
            >
              👨‍⚕️ {faculty.userProfile.name}
            </div>
          ))}
          {session.learners.map(learner => (
            <div
              key={learner.userId}
              style={{
                padding: '2px 6px',
                background: '#28a74520',
                color: '#28a745',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 500
              }}
            >
              👨‍🎓 {learner.userProfile.name}
            </div>
          ))}
          {session.stage && (
            <div
              style={{
                padding: '2px 6px',
                background: '#6f42c120',
                color: '#6f42c1',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 500
              }}
            >
              🎭 {session.stage.userProfile.name}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#6c757d' }}>
          Created {new Date(session.createdAt).toLocaleDateString()}
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {isUserInSession() && (
            <div style={{
              padding: '4px 8px',
              background: '#e9ecef',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 500
            }}>
              {getUserRole() === 'faculty' ? 'Instructor' : 
               getUserRole() === 'learner' ? 'Joined' : 'Stage Op'}
            </div>
          )}
          
          {canJoin() && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onJoin()
              }}
              style={{
                padding: '6px 12px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Join
            </button>
          )}
          
          {isUserInSession() && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onJoin() // Will navigate to the session
              }}
              style={{
                padding: '6px 12px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Enter
            </button>
          )}
        </div>
      </div>
    </div>
  )
}