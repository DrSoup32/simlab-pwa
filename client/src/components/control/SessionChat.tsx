// client/src/components/control/SessionChat.tsx
import React, { useState, useRef, useEffect } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { UserService } from '../../services/userService'
import { socket } from '../../socket'

interface ChatMessage {
  id: string
  sessionId: string
  userId: string
  userName: string
  message: string
  timestamp: Date
  isPrivate?: boolean
  recipientId?: string
  recipientName?: string
}

export default function SessionChat() {
  const { currentSession } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isTyping, setIsTyping] = useState<string[]>([])
  const [showPrivateOptions, setShowPrivateOptions] = useState(false)
  const [selectedRecipient, setSelectedRecipient] = useState<{ id: string, name: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<number | null>(null)

  const currentUser = UserService.getInstance().getCurrentUser()

  useEffect(() => {
    if (!currentSession || !currentUser) return

    // TODO: Add chat socket listeners when socket types are updated
    // For now, we'll implement a basic local chat interface
    
    return () => {
      // Cleanup when ready
    }
  }, [currentSession, currentUser])

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentSession || !currentUser) return

    const message: ChatMessage = {
      id: Date.now().toString(),
      sessionId: currentSession.id,
      userId: currentUser.id,
      userName: currentUser.name,
      message: newMessage.trim(),
      timestamp: new Date(),
      isPrivate: !!selectedRecipient,
      recipientId: selectedRecipient?.id,
      recipientName: selectedRecipient?.name
    }

    // TODO: Send via socket when chat events are added to socket types
    // For now, just add to local messages for demo
    setMessages(prev => [...prev, message])

    // Clear input and recipient
    setNewMessage('')
    setSelectedRecipient(null)
    setShowPrivateOptions(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
    
    if (!currentSession || !currentUser) return

    // TODO: Send typing indicator when socket types support it
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to stop typing indicator (for future implementation)
    typingTimeoutRef.current = window.setTimeout(() => {
      // TODO: Stop typing indicator
    }, 2000)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const getParticipants = () => {
    if (!currentSession) return []
    
    const all = [
      ...currentSession.faculty.map(f => ({ id: f.userId, name: f.userProfile.name, type: 'faculty' })),
      ...currentSession.learners.map(l => ({ id: l.userId, name: l.userProfile.name, type: 'learner' })),
      ...(currentSession.stage ? [{ id: currentSession.stage.userId, name: currentSession.stage.userProfile.name, type: 'stage' }] : [])
    ]
    
    return all.filter(p => p.id !== currentUser?.id)
  }

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!currentSession || !currentUser) return null

  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'white'
    }}>
      {/* Chat Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e9ecef',
        background: '#f8f9fa'
      }}>
        <h4 style={{ 
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          color: '#495057'
        }}>
          Session Chat
        </h4>
        {selectedRecipient && (
          <div style={{
            fontSize: '12px',
            color: '#007bff',
            marginTop: '4px'
          }}>
            Private message to {selectedRecipient.name}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        padding: '8px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {messages.map(message => (
          <div
            key={message.id}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: message.userId === currentUser.id ? '#007bff' : '#f8f9fa',
              color: message.userId === currentUser.id ? 'white' : '#495057',
              alignSelf: message.userId === currentUser.id ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              border: message.isPrivate ? '1px solid #ffc107' : 'none'
            }}
          >
            {message.userId !== currentUser.id && (
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '2px',
                opacity: 0.8
              }}>
                {message.userName}
                {message.isPrivate && message.recipientId === currentUser.id && (
                  <span style={{ color: '#ffc107', marginLeft: '4px' }}>
                    (private)
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: '14px', lineHeight: 1.4 }}>
              {message.message}
            </div>
            <div style={{
              fontSize: '11px',
              opacity: 0.7,
              marginTop: '2px',
              textAlign: 'right'
            }}>
              {formatTime(message.timestamp)}
              {message.isPrivate && message.userId === currentUser.id && (
                <span style={{ marginLeft: '4px' }}>
                  to {message.recipientName}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicators */}
        {isTyping.length > 0 && (
          <div style={{
            padding: '8px 12px',
            fontSize: '12px',
            color: '#6c757d',
            fontStyle: 'italic'
          }}>
            {isTyping.length === 1 
              ? `${isTyping[0]} is typing...`
              : `${isTyping.join(', ')} are typing...`
            }
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #e9ecef',
        background: '#f8f9fa'
      }}>
        {/* Private message controls */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          marginBottom: '8px'
        }}>
          <button
            onClick={() => setShowPrivateOptions(!showPrivateOptions)}
            style={{
              padding: '4px 8px',
              background: selectedRecipient ? '#ffc107' : '#e9ecef',
              color: selectedRecipient ? '#000' : '#6c757d',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {selectedRecipient ? `Private to ${selectedRecipient.name}` : 'Public'}
          </button>

          {showPrivateOptions && (
            <div style={{
              position: 'relative',
              display: 'flex',
              gap: '4px'
            }}>
              <button
                onClick={() => {
                  setSelectedRecipient(null)
                  setShowPrivateOptions(false)
                }}
                style={{
                  padding: '4px 8px',
                  background: !selectedRecipient ? '#28a745' : '#e9ecef',
                  color: !selectedRecipient ? 'white' : '#6c757d',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                All
              </button>
              {getParticipants().map(participant => (
                <button
                  key={participant.id}
                  onClick={() => {
                    setSelectedRecipient({ id: participant.id, name: participant.name })
                    setShowPrivateOptions(false)
                  }}
                  style={{
                    padding: '4px 8px',
                    background: selectedRecipient?.id === participant.id ? '#28a745' : '#e9ecef',
                    color: selectedRecipient?.id === participant.id ? 'white' : '#6c757d',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {participant.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message input */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={selectedRecipient ? `Private message to ${selectedRecipient.name}...` : "Type a message..."}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '20px',
              outline: 'none'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            style={{
              padding: '8px 16px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
              opacity: newMessage.trim() ? 1 : 0.6
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}