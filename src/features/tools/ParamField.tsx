import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParamDef } from '@/tools/types'

interface Props {
  def: ParamDef
  value: unknown
  onChange: (v: unknown) => void
  error?: string
}

export function ParamField({ def, value, onChange, error }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [def.hintKey ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined

  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const

  let control
  switch (def.type) {
    case 'boolean':
      return (
        <div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="size-5 accent-[var(--action)]"
            />
            <span className="font-medium">{t(def.labelKey)}</span>
          </label>
          {def.hintKey && (
            <p id={hintId} className="field-hint">
              {t(def.hintKey)}
            </p>
          )}
        </div>
      )
    case 'select':
      control = (
        <select {...common} className="field-input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      )
      break
    case 'number':
      control = (
        <input
          {...common}
          type="number"
          inputMode="numeric"
          className="field-input"
          min={def.min}
          max={def.max}
          value={Number(value)}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
      )
      break
    default:
      control = (
        <input
          {...common}
          type={def.type === 'password' ? 'password' : 'text'}
          autoComplete={def.type === 'password' ? 'off' : undefined}
          className="field-input"
          placeholder={def.type === 'text' && def.placeholderKey ? t(def.placeholderKey) : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {t(def.labelKey)}
      </label>
      {control}
      {def.hintKey && (
        <p id={hintId} className="field-hint">
          {t(def.hintKey)}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
