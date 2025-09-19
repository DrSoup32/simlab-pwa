// client/src/views/Lobby.tsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserService } from '../services/userService'
import { SessionService } from '../services/sessionService'
import { UserProfile, Session, UserRole, LobbyState, SessionInvitation } from '../types/session'

// Sub-components
import UserProfileCard from '../components/UserProfileCard'
import SessionCard from '../components/SessionCard'
import CreateSessionModal from '../components/CreateSessionModal'
import UserProfileModal from '../components/UserProfileModal'

export default function Lobby() {
  const navigate = useNavigate()
  const userService = UserService.getInstance()
  const sessionService = SessionService.getInstance()

  // User state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Lobby state
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [showCreateSession, setShowCreateSession] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [sessionFilter, setSessionFilter] = useState<'all' | 'joinable' | 'mine'>('all')
  const [invitations, setInvitations] = useState<SessionInvitation[]>([])

  // Initialize user and lobby
  useEffect(() => {
    const initializeLobby = async () => {
      try {
        setLoading(true)
        
        // Check if user is logged in
        const user = userService.getCurrentUser()
        if (!user) {
          setShowProfileModal(true)
          setLoading(false)
          return
        }
        
        setCurrentUser(user)
        
        // Join the lobby
        await sessionService.joinLobby()
        
        // Load user's invitations
        await loadInvitations()
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize lobby')
      } finally {
        setLoading(false)
      }
    }

    initializeLobby()

    // Cleanup on unmount
    return () => {
      sessionService.leaveLobby()
    }
  }, [])

  // Listen for lobby updates
  useEffect(() => {
    const handleLobbyUpdate = (state: LobbyState) => {
      setLobbyState(state)
    }

    const handleInvitation = (invitation: SessionInvitation) => {
      setInvitations(prev => [invitation, ...prev])
    }

    sessionService.on('lobbyUpdated', handleLobbyUpdate)
    sessionService.on('invitationReceived', handleInvitation)

    return () => {
      sessionService.off('lobbyUpdated', handleLobbyUpdate)
      sessionService.off('invitationReceived', handleInvitation)
    }
  }, [])

  // User profile management
  const handleCreateProfile = async (profileData: Partial<UserProfile>) => {
    try {
      const user = await userService.setUser(profileData)
      setCurrentUser(user)
      setShowProfileModal(false)
      
      // Now join lobby
      await sessionService.joinLobby()
      await loadInvitations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    }
  }

  const handleEditProfile = async (profileData: Partial<UserProfile>) => {
    try {
      const user = await userService.setUser(profileData)
      setCurrentUser(user)
      setShowProfileModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }

  // Session management
  const handleCreateSession = async (sessionData: {
    name: string
    description?: string
    caseId: string
    maxLearners?: number
    allowLateJoin?: boolean
    publicJoin?: boolean
  }) => {
    try {
      const session = await sessionService.createSession(sessionData)
      setShowCreateSession(false)
      
      // Navigate to the appropriate view based on user role
      if (currentUser?.role === 'faculty') {
        navigate(`/control?session=${session.id}`)
      } else if (currentUser?.role === 'stage') {
        navigate(`/stage?session=${session.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const handleJoinSession = async (sessionId: string) => {
    try {
      await sessionService.joinSession(sessionId)
      
      // Navigate to the appropriate view based on user role
      if (currentUser?.role === 'faculty') {
        navigate(`/control?session=${sessionId}`)
      } else if (currentUser?.role === 'learner') {
        navigate(`/learner?session=${sessionId}`)
      } else if (currentUser?.role === 'stage') {
        navigate(`/stage?session=${sessionId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session')
    }
  }

  const handleRespondToInvitation = async (invitationId: string, accept: boolean) => {
    try {
      await sessionService.respondToInvitation(invitationId, accept)
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
      
      if (accept) {
        // Navigation will be handled by the sessionService
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to invitation')
    }
  }

  // Load user invitations
  const loadInvitations = async () => {
    try {
      const response = await fetch('/api/invitations')
      if (response.ok) {
        const invitations = await response.json()
        setInvitations(invitations)
      }
    } catch (err) {
      console.warn('Failed to load invitations:', err)
    }
  }

  // Filter sessions
  const filteredSessions = lobbyState?.activeSessions.filter(session => {
    if (sessionFilter === 'mine') {
      return session.createdBy === currentUser?.id ||
             session.faculty.some(f => f.userId === currentUser?.id) ||
             session.learners.some(l => l.userId === currentUser?.id)
    }
    if (sessionFilter === 'joinable') {
      return session.status === 'lobby' &&
             session.settings.publicJoin &&
             session.learners.length < session.settings.maxLearners
    }
    return true
  }) || []

  // Render loading state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'system-ui'
      }}>
        <div>Loading SimLab...</div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'system-ui',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ color: 'red' }}>Error: {error}</div>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ 
      fontFamily: 'system-ui', 
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '30px',
        borderBottom: '1px solid #eee',
        paddingBottom: '20px'
      }}>
        <div>
          <h1 style={{ margin: 0 }}>SimLab Lobby</h1>
          <p style={{ margin: '4px 0 0', color: '#666' }}>
            Welcome to the Medical Simulation Laboratory
          </p>
        </div>
        
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <UserProfileCard 
              user={currentUser}
              onClick={() => setShowProfileModal(true)}
            />
            <button
              onClick={() => userService.clearUser()}
              style={{
                padding: '6px 12px',
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Invitations */}
      {invitations.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3>Session Invitations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invitations.map(invitation => (
              <div 
                key={invitation.id}
                style={{
                  padding: '12px',
                  background: '#f8f9fa',
                  border: '1px solid #e9ecef',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <strong>Session Invitation</strong>
                  {invitation.message && (
                    <p style={{ margin: '4px 0 0', color: '#666' }}>
                      {invitation.message}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleRespondToInvitation(invitation.id, true)}
                    style={{
                      padding: '6px 12px',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondToInvitation(invitation.id, false)}
                    style={{
                      padding: '6px 12px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions */}
      <div style={{ display: 'flex', gap: '30px' }}>
        {/* Sessions List */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h3>Active Sessions</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select 
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value as any)}
                style={{ padding: '6px 8px' }}
              >
                <option value="all">All Sessions</option>
                <option value="joinable">Joinable</option>
                <option value="mine">My Sessions</option>
              </select>
              
              {currentUser?.role === 'faculty' && (
                <button
                  onClick={() => setShowCreateSession(true)}
                  style={{
                    padding: '8px 16px',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Create Session
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredSessions.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px',
                color: '#666',
                background: '#f8f9fa',
                borderRadius: '6px'
              }}>
                {sessionFilter === 'mine' ? 'No sessions found' : 'No active sessions'}
              </div>
            ) : (
              filteredSessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  currentUser={currentUser}
                  onJoin={() => handleJoinSession(session.id)}
                  onSelect={() => setSelectedSession(session)}
                />
              ))
            )}
          </div>
        </div>

        {/* Online Users Sidebar */}
        <div style={{ width: '280px' }}>
          <h3>Online Users</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lobbyState?.onlineUsers.map(user => (
              <div
                key={user.id}
                style={{
                  padding: '8px',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#28a745'
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {user.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <UserProfileModal
        open={showProfileModal}
        user={currentUser}
        onSave={currentUser ? handleEditProfile : handleCreateProfile}
        onClose={() => setShowProfileModal(false)}
      />

      <CreateSessionModal
        open={showCreateSession}
        availableCases={lobbyState?.availableCases || []}
        onCreate={handleCreateSession}
        onClose={() => setShowCreateSession(false)}
      />
    </div>
  )
}