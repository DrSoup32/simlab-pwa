// client/src/components/control/SessionNotes.tsx
import React, { useState, useEffect } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { UserService } from '../../services/userService'

interface SessionNote {
  id: string
  sessionId: string
  userId: string
  userName: string
  content: string
  timestamp: Date
  isPrivate: boolean
  tags?: string[]
  attachments?: string[]
}

export default function SessionNotes() {
  const { currentSession } = useSession()
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteTags, setNewNoteTags] = useState('')
  const [isPrivateNote, setIsPrivateNote] = useState(false)
  const [showNewNoteForm, setShowNewNoteForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const currentUser = UserService.getInstance().getCurrentUser()

  useEffect(() => {
    if (currentSession) {
      // TODO: Load notes for session from server
      // For now, just load from localStorage
      loadNotesFromStorage()
    }
  }, [currentSession])

  const loadNotesFromStorage = () => {
    if (!currentSession) return
    
    const storageKey = `session-notes-${currentSession.id}`
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsedNotes = JSON.parse(stored).map((note: any) => ({
          ...note,
          timestamp: new Date(note.timestamp)
        }))
        setNotes(parsedNotes)
      } catch {
        setNotes([])
      }
    }
  }

  const saveNotesToStorage = (updatedNotes: SessionNote[]) => {
    if (!currentSession) return
    
    const storageKey = `session-notes-${currentSession.id}`
    localStorage.setItem(storageKey, JSON.stringify(updatedNotes))
  }

  const addNote = () => {
    if (!newNoteContent.trim() || !currentSession || !currentUser) return

    const tags = newNoteTags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    const note: SessionNote = {
      id: Date.now().toString(),
      sessionId: currentSession.id,
      userId: currentUser.id,
      userName: currentUser.name,
      content: newNoteContent.trim(),
      timestamp: new Date(),
      isPrivate: isPrivateNote,
      tags: tags.length > 0 ? tags : undefined
    }

    const updatedNotes = [note, ...notes]
    setNotes(updatedNotes)
    saveNotesToStorage(updatedNotes)

    // Clear form
    setNewNoteContent('')
    setNewNoteTags('')
    setIsPrivateNote(false)
    setShowNewNoteForm(false)
  }

  const deleteNote = (noteId: string) => {
    const updatedNotes = notes.filter(note => note.id !== noteId)
    setNotes(updatedNotes)
    saveNotesToStorage(updatedNotes)
  }

  const filteredNotes = notes.filter(note => {
    // Search in content
    const matchesSearch = !searchQuery || 
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.userName.toLowerCase().includes(searchQuery.toLowerCase())

    // Filter by tags
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => note.tags?.includes(tag))

    return matchesSearch && matchesTags
  })

  const allTags = Array.from(new Set(notes.flatMap(note => note.tags || [])))

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleString([], {
      month: 'short',
      day: 'numeric',
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
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e9ecef',
        background: '#f8f9fa'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <h4 style={{ 
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: '#495057'
          }}>
            Session Notes ({filteredNotes.length})
          </h4>
          
          <button
            onClick={() => setShowNewNoteForm(!showNewNoteForm)}
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
            + Add Note
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes..."
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px'
          }}
        />

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginTop: '8px'
          }}>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTags(prev => 
                    prev.includes(tag) 
                      ? prev.filter(t => t !== tag)
                      : [...prev, tag]
                  )
                }}
                style={{
                  padding: '2px 6px',
                  background: selectedTags.includes(tag) ? '#007bff' : '#e9ecef',
                  color: selectedTags.includes(tag) ? 'white' : '#6c757d',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Note Form */}
      {showNewNoteForm && (
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e9ecef',
          background: '#f8f9fa'
        }}>
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Write your note..."
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              resize: 'vertical',
              marginBottom: '8px'
            }}
          />
          
          <input
            type="text"
            value={newNoteTags}
            onChange={(e) => setNewNoteTags(e.target.value)}
            placeholder="Tags (comma separated)"
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '8px'
            }}
          />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: '#6c757d'
            }}>
              <input
                type="checkbox"
                checked={isPrivateNote}
                onChange={(e) => setIsPrivateNote(e.target.checked)}
              />
              Private note
            </label>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowNewNoteForm(false)}
                style={{
                  padding: '6px 12px',
                  background: '#f8f9fa',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addNote}
                disabled={!newNoteContent.trim()}
                style={{
                  padding: '6px 12px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: newNoteContent.trim() ? 'pointer' : 'not-allowed',
                  opacity: newNoteContent.trim() ? 1 : 0.6,
                  fontSize: '12px'
                }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px'
      }}>
        {filteredNotes.map(note => (
          <div
            key={note.id}
            style={{
              padding: '12px',
              marginBottom: '8px',
              background: '#f8f9fa',
              borderRadius: '6px',
              border: note.isPrivate ? '1px solid #ffc107' : '1px solid transparent'
            }}
          >
            {/* Note header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '8px'
            }}>
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#495057'
                }}>
                  {note.userName}
                  {note.isPrivate && (
                    <span style={{
                      marginLeft: '6px',
                      padding: '2px 4px',
                      background: '#ffc107',
                      color: '#000',
                      borderRadius: '3px',
                      fontSize: '10px'
                    }}>
                      Private
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#6c757d'
                }}>
                  {formatTime(note.timestamp)}
                </div>
              </div>

              {note.userId === currentUser.id && (
                <button
                  onClick={() => deleteNote(note.id)}
                  style={{
                    padding: '2px 6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#dc3545',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Note content */}
            <div style={{
              fontSize: '14px',
              lineHeight: 1.4,
              marginBottom: '8px',
              whiteSpace: 'pre-wrap'
            }}>
              {note.content}
            </div>

            {/* Tags */}
            {note.tags && note.tags.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px'
              }}>
                {note.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      padding: '2px 6px',
                      background: '#007bff',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '10px'
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {filteredNotes.length === 0 && !searchQuery && selectedTags.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#6c757d',
            fontSize: '14px'
          }}>
            <div style={{ marginBottom: '8px' }}>📝</div>
            No notes yet for this session
          </div>
        )}

        {/* No search results */}
        {filteredNotes.length === 0 && (searchQuery || selectedTags.length > 0) && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#6c757d',
            fontSize: '14px'
          }}>
            No notes match your search
          </div>
        )}
      </div>
    </div>
  )
}