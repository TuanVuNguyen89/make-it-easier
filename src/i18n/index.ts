import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import vi from './vi.json'
import en from './en.json'

export const LANGS = ['vi', 'en'] as const
export type Lang = (typeof LANGS)[number]
const KEY = 'lang'

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'vi' || v === 'en') return v
  } catch {
    /* localStorage có thể bị chặn */
  }
  return 'vi' // mặc định tiếng Việt theo constitution
}

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: stored(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(KEY, lng)
  } catch {
    /* bỏ qua */
  }
})

export default i18n
