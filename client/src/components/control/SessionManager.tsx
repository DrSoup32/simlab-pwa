// client/src/components/control/SessionManager.tsx
import React, { useState, useEffect } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { SessionService } from '../../services/sessionService'
import { UserService } from '../../services/userService'
import { Session } from '../../types/session'

export default function SessionManager() {
  const { joinSession } = useSession()
  const [availableSessions, setAvailableSessions] = useState<Session[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [newSessionDescription, setNewSessionDescription] = useState('')
  const [selectedCase, setSelectedCase] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // User creation state
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState<'faculty' | 'learner'>('faculty')

  const currentUser = UserService.getInstance().getCurrentUser()

  useEffect(() => {
    // Show user creation modal if no current user
    if (!currentUser) {
      setShowUserModal(true)
    } else {
      loadAvailableSessions()
    }
  }, [currentUser])

  const loadAvailableSessions = async () => {
    try {
      // For now, we'll get this from the lobby state
      const lobbyState = SessionService.getInstance().getLobbyState()
      if (lobbyState) {
        setAvailableSessions(lobbyState.activeSessions)
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleCreateSession = async () => {
    if (!newSessionTitle.trim() || !currentUser) return

    setIsLoading(true)
    try {
      const session = await SessionService.getInstance().createSession({
        name: newSessionTitle.trim(),
        description: newSessionDescription.trim(),
        caseId: selectedCase || 'default-case'
      })

      // Automatically join the created session
      await joinSession(session.id)
      
      setShowCreateModal(false)
      setNewSessionTitle('')
      setNewSessionDescription('')
      setSelectedCase('')
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinSession = async (sessionId: string) => {
    setIsLoading(true)
    try {
      await joinSession(sessionId)
    } catch (error) {
      console.error('Failed to join session:', error)
      alert('Failed to join session. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!userName.trim() || !userEmail.trim()) return

    setIsLoading(true)
    try {
      const user = await UserService.getInstance().setUser({
        name: userName.trim(),
        email: userEmail.trim(),
        role: userRole
      })

      setShowUserModal(false)
      setUserName('')
      setUserEmail('')
      loadAvailableSessions()
      
      // Reload the page to refresh the user context
      window.location.reload()
    } catch (error) {
      console.error('Failed to create user:', error)
      alert('Failed to create user profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatSessionTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#28a745'
      case 'paused': return '#ffc107'
      case 'completed': return '#6c757d'
      default: return '#007bff'
    }
  }

  const canCreateSessions = currentUser?.role === 'faculty'

  return (
    <div style={{
      padding: '40px',
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'system-ui'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ 
          margin: '0 0 8px', 
          fontSize: '24px',
          color: '#495057'
        }}>
          Session Control
        </h1>
        <p style={{ 
          margin: 0, 
          color: '#6c757d',
          fontSize: '16px'
        }}>
          {canCreateSessions 
            ? 'Create a new simulation session or join an existing one'
            : 'Join an active simulation session'
          }
        </p>
      </div>

      {/* Create Session Button for Faculty */}
      {canCreateSessions && (
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '12px 24px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            + Create New Session
          </button>
        </div>
      )}

      {/* Available Sessions */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ 
          margin: '0 0 16px',
          fontSize: '18px',
          color: '#495057'
        }}>
          Available Sessions
        </h3>

        {availableSessions.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            background: '#f8f9fa',
            borderRadius: '8px',
            color: '#6c757d'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎭</div>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>No active sessions</div>
            <div style={{ fontSize: '14px' }}>
              {canCreateSessions 
                ? 'Create the first session to get started'
                : 'Waiting for faculty to create a session'
              }
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {availableSessions.map(session => (
              <div
                key={session.id}
                style={{
                  padding: '16px',
                  background: 'white',
                  border: '1px solid #e9ecef',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px'
                  }}>
                    <h4 style={{ 
                      margin: 0,
                      fontSize: '16px',
                      color: '#495057'
                    }}>
                      {session.name}
                    </h4>
                    <span
                      style={{
                        padding: '2px 8px',
                        background: getStatusColor(session.status),
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500
                      }}
                    >
                      {session.status}
                    </span>
                  </div>
                  
                  {session.description && (
                    <div style={{
                      fontSize: '14px',
                      color: '#6c757d',
                      marginBottom: '4px'
                    }}>
                      {session.description}
                    </div>
                  )}
                  
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>
                    Created {formatSessionTime(session.createdAt)} • {' '}
                    {session.faculty.length + session.learners.length + (session.stage ? 1 : 0)} participants
                  </div>
                </div>

                <button
                  onClick={() => handleJoinSession(session.id)}
                  disabled={isLoading}
                  style={{
                    padding: '8px 16px',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  Join Session
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        marginTop: '32px'
      }}>
        <button
          onClick={() => window.location.href = '/#/'}
          style={{
            padding: '8px 16px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← Back to Lobby
        </button>
        
        <button
          onClick={() => window.location.href = '/#/legacy'}
          style={{
            padding: '8px 16px',
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Legacy Routes
        </button>
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
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
            padding: '24px',
            width: 'min(500px, 90vw)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 20px' }}>Create New Session</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Session Title *
              </label>
              <input
                type="text"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="Enter session title"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Description
              </label>
              <textarea
                value={newSessionDescription}
                onChange={(e) => setNewSessionDescription(e.target.value)}
                placeholder="Optional session description"
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

            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Case (Optional)
              </label>
              <select
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="">No case selected</option>
                <option value="A-Fib">A-Fib</option>
                <option value="Asthma">Asthma</option>
                <option value="case-anemia">Anemia</option>
                <option value="case-sepsis">Sepsis</option>
                <option value="Thyroid Storm">Thyroid Storm</option>
                <option value="Addisonian Crisis">Addisonian Crisis</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
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
                onClick={handleCreateSession}
                disabled={!newSessionTitle.trim() || isLoading}
                style={{
                  padding: '8px 16px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!newSessionTitle.trim() || isLoading) ? 'not-allowed' : 'pointer',
                  opacity: (!newSessionTitle.trim() || isLoading) ? 0.6 : 1
                }}
              >
                {isLoading ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Modal */}
      {showUserModal && (
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
            padding: '24px',
            width: 'min(400px, 90vw)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px' }}>Create Your Profile</h3>
            <p style={{ margin: '0 0 20px', color: '#6c757d', fontSize: '14px' }}>
              Please create your profile to access the control interface.
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Name *
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Email *
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="Enter your email"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '4px', 
                fontSize: '14px', 
                fontWeight: 500 
              }}>
                Role
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="radio"
                    name="role"
                    value="faculty"
                    checked={userRole === 'faculty'}
                    onChange={(e) => setUserRole(e.target.value as 'faculty' | 'learner')}
                  />
                  Faculty
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="radio"
                    name="role"
                    value="learner"
                    checked={userRole === 'learner'}
                    onChange={(e) => setUserRole(e.target.value as 'faculty' | 'learner')}
                  />
                  Learner
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => window.location.href = '/#/'}
                style={{
                  padding: '8px 16px',
                  background: '#f8f9fa',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Go to Lobby
              </button>
              <button
                onClick={handleCreateUser}
                disabled={!userName.trim() || !userEmail.trim() || isLoading}
                style={{
                  padding: '8px 16px',
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!userName.trim() || !userEmail.trim() || isLoading) ? 'not-allowed' : 'pointer',
                  opacity: (!userName.trim() || !userEmail.trim() || isLoading) ? 0.6 : 1
                }}
              >
                {isLoading ? 'Creating...' : 'Create Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}