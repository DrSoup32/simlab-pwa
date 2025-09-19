// client/src/components/control/SessionParticipants.tsx
import React, { useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { SessionService } from '../../services/sessionService'

export default function SessionParticipants() {
  const { currentSession, canControlSession } = useSession()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')

  if (!currentSession) return null

  const allParticipants = [
    ...currentSession.faculty.map(f => ({ ...f, type: 'faculty' as const })),
    ...currentSession.learners.map(l => ({ ...l, type: 'learner' as const })),
    ...(currentSession.stage ? [{ ...currentSession.stage, type: 'stage' as const }] : [])
  ]

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    
    try {
      // In a real implementation, you'd search for users by email and send invitations
      // For now, we'll just show success
      console.log('Inviting user:', inviteEmail, inviteMessage)
      setInviteEmail('')
      setInviteMessage('')
      setShowInviteModal(false)
      // TODO: Implement actual invitation logic
    } catch (error) {
      console.error('Failed to send invitation:', error)
    }
  }

  const getParticipantIcon = (type: string) => {
    switch (type) {
      case 'faculty': return '👨‍⚕️'
      case 'learner': return '👨‍🎓'
      case 'stage': return '🎭'
      default: return '👤'
    }
  }

  const getParticipantColor = (type: string) => {
    switch (type) {
      case 'faculty': return '#007bff'
      case 'learner': return '#28a745'
      case 'stage': return '#6f42c1'
      default: return '#6c757d'
    }
  }

  return (
    <div style={{ 
      flex: 1,
      padding: '16px',
      overflow: 'auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h4 style={{ 
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: '#495057'
        }}>
          Participants ({allParticipants.length})
        </h4>
        
        {canControlSession() && (
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              padding: '4px 8px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            + Invite
          </button>
        )}
      </div>

      {/* Participants List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {allParticipants.map(participant => (
          <div
            key={participant.userId}
            style={{
              padding: '8px',
              background: '#f8f9fa',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: `2px solid ${participant.isActive ? getParticipantColor(participant.type) + '40' : 'transparent'}`
            }}
          >
            {/* Status indicator */}
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: participant.isActive ? '#28a745' : '#6c757d'
              }}
            />
            
            {/* Avatar */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: participant.userProfile.avatar 
                  ? `url(${participant.userProfile.avatar}) center/cover`
                  : getParticipantColor(participant.type),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {!participant.userProfile.avatar && 
                participant.userProfile.name.charAt(0).toUpperCase()}
            </div>

            {/* User info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '14px',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {participant.userProfile.name}
              </div>
              <div style={{ 
                fontSize: '12px',
                color: getParticipantColor(participant.type),
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span>{getParticipantIcon(participant.type)}</span>
                {participant.type}
                {participant.assignedRole && (
                  <span style={{ color: '#6c757d' }}>
                    • {participant.assignedRole}
                  </span>
                )}
              </div>
            </div>

            {/* Join time */}
            <div style={{ 
              fontSize: '11px',
              color: '#6c757d',
              textAlign: 'right'
            }}>
              {new Date(participant.joinedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {allParticipants.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#6c757d',
          fontSize: '14px'
        }}>
          No participants yet
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: 'min(400px, 90vw)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px' }}>Invite Participant</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Enter email address"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
                Message (optional)
              </label>
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a personal message..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowInviteModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#f8f9fa',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim()}
                style={{
                  padding: '8px 16px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed',
                  opacity: inviteEmail.trim() ? 1 : 0.6
                }}
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}