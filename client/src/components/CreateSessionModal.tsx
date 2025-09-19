// client/src/components/CreateSessionModal.tsx
import React, { useState } from 'react'
import { Case } from '../types/session'

interface CreateSessionModalProps {
  open: boolean
  availableCases: Case[]
  onCreate: (sessionData: {
    name: string
    description?: string
    caseId: string
    maxLearners?: number
    allowLateJoin?: boolean
    publicJoin?: boolean
  }) => void
  onClose: () => void
}

export default function CreateSessionModal({ 
  open, 
  availableCases, 
  onCreate, 
  onClose 
}: CreateSessionModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    caseId: '',
    maxLearners: 8,
    allowLateJoin: true,
    publicJoin: false
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Session name is required'
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Session name must be at least 3 characters'
    }

    if (!formData.caseId) {
      newErrors.caseId = 'Please select a case'
    }

    if (formData.maxLearners < 1) {
      newErrors.maxLearners = 'Must allow at least 1 learner'
    } else if (formData.maxLearners > 20) {
      newErrors.maxLearners = 'Maximum 20 learners allowed'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    onCreate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      caseId: formData.caseId,
      maxLearners: formData.maxLearners,
      allowLateJoin: formData.allowLateJoin,
      publicJoin: formData.publicJoin
    })

    // Reset form
    setFormData({
      name: '',
      description: '',
      caseId: '',
      maxLearners: 8,
      allowLateJoin: true,
      publicJoin: false
    })
    setErrors({})
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  const selectedCase = availableCases.find(c => c.id === formData.caseId)

  if (!open) return null

  return (
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
        width: 'min(600px, 90vw)',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '20px' }}>
          Create New Session
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Session Name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Session Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Morning Cardiology Simulation"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.name ? '#dc3545' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
            {errors.name && (
              <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                {errors.name}
              </div>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Brief description of the session objectives..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Case Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Case *
            </label>
            <select
              value={formData.caseId}
              onChange={(e) => handleInputChange('caseId', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${errors.caseId ? '#dc3545' : '#ddd'}`,
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="">Select a case...</option>
              {availableCases.map(case_ => (
                <option key={case_.id} value={case_.id}>
                  {case_.title}
                </option>
              ))}
            </select>
            {errors.caseId && (
              <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                {errors.caseId}
              </div>
            )}
            
            {selectedCase && (
              <div style={{
                padding: '8px 12px',
                background: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: '4px',
                marginTop: '8px'
              }}>
                <div style={{ fontWeight: 500, fontSize: '14px' }}>
                  {selectedCase.title}
                </div>
                {selectedCase.description && (
                  <div style={{ color: '#6c757d', fontSize: '12px', marginTop: '2px' }}>
                    {selectedCase.description}
                  </div>
                )}
                <div style={{ color: '#6c757d', fontSize: '12px', marginTop: '4px' }}>
                  {selectedCase.assets?.length || 0} assets available
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '16px' }}>Session Settings</h4>
            
            {/* Max Learners */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                Maximum Learners
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.maxLearners}
                onChange={(e) => handleInputChange('maxLearners', parseInt(e.target.value) || 1)}
                style={{
                  width: '100px',
                  padding: '8px 12px',
                  border: `1px solid ${errors.maxLearners ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              {errors.maxLearners && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.maxLearners}
                </div>
              )}
            </div>

            {/* Allow Late Join */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.allowLateJoin}
                  onChange={(e) => handleInputChange('allowLateJoin', e.target.checked)}
                />
                <span>Allow learners to join after session starts</span>
              </label>
            </div>

            {/* Public Join */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={formData.publicJoin}
                  onChange={(e) => handleInputChange('publicJoin', e.target.checked)}
                />
                <span>Allow public join (anyone can join without invitation)</span>
              </label>
              <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px', marginLeft: '24px' }}>
                If unchecked, you'll need to invite learners manually
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
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
              type="submit"
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
          </div>
        </form>
      </div>
    </div>
  )
}