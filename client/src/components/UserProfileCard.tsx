// client/src/components/UserProfileCard.tsx
import React from 'react'
import { UserProfile } from '../types/session'

interface UserProfileCardProps {
  user: UserProfile
  onClick?: () => void
}

export default function UserProfileCard({ user, onClick }: UserProfileCardProps) {
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'faculty': return '#007bff'
      case 'learner': return '#28a745'
      case 'stage': return '#6f42c1'
      default: return '#6c757d'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'faculty': return 'Faculty'
      case 'learner': return 'Learner'
      case 'stage': return 'Stage'
      default: return 'User'
    }
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: '#f8f9fa',
        border: '1px solid #e9ecef',
        borderRadius: '6px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = '#e9ecef'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = '#f8f9fa'
        }
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: user.avatar 
            ? `url(${user.avatar}) center/cover`
            : `linear-gradient(135deg, ${getRoleColor(user.role)}, ${getRoleColor(user.role)}aa)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        {!user.avatar && user.name.charAt(0).toUpperCase()}
      </div>

      {/* User Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          fontWeight: 500, 
          fontSize: '14px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {user.name}
        </div>
        <div style={{ 
          fontSize: '12px', 
          color: getRoleColor(user.role),
          fontWeight: 500
        }}>
          {getRoleLabel(user.role)}
        </div>
      </div>

      {/* Stats (optional) */}
      {user.stats.sessionsCompleted > 0 && (
        <div style={{ fontSize: '11px', color: '#6c757d', textAlign: 'right' }}>
          <div>{user.stats.sessionsCompleted} sessions</div>
          {user.stats.totalTime > 0 && (
            <div>{Math.round(user.stats.totalTime / 60)}h</div>
          )}
        </div>
      )}
    </div>
  )
}