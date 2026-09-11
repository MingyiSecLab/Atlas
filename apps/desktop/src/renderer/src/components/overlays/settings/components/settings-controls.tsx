import React from 'react'

export interface SettingsPageLayoutProps {
  label: string
  children: React.ReactNode
}

export const SettingsPageLayout: React.FC<SettingsPageLayoutProps> = ({ label, children }) => (
  <div className="settings-page" aria-label={label}>
    {children}
  </div>
)

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  children
}) => (
  <section className="settings-section">
    <div className="settings-section-heading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    <div className="settings-section-body">{children}</div>
  </section>
)

interface SettingsRowProps {
  title: string
  description?: string
  children: React.ReactNode
}

export const SettingsRow: React.FC<SettingsRowProps> = ({ title, description, children }) => (
  <div className="settings-row">
    <div className="settings-row-copy">
      <label>{title}</label>
      {description && <p>{description}</p>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
)

interface ToggleProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export const Toggle: React.FC<ToggleProps> = ({ checked, label, disabled, onChange }) => (
  <button
    className={`settings-toggle${checked ? ' is-checked' : ''}`}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    <span />
  </button>
)

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string
}

export const SettingsSelect: React.FC<SelectProps> = ({ label, children, ...props }) => (
  <select className="settings-select" aria-label={label} {...props}>
    {children}
  </select>
)

interface SettingsPageActionsProps {
  children: React.ReactNode
}

export const SettingsPageActions: React.FC<SettingsPageActionsProps> = ({ children }) => (
  <div className="settings-page-actions">{children}</div>
)
