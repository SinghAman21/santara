export default function SantaraMark() {
  return <svg className="santara-mark" viewBox="0 0 100 110" fill="none" aria-hidden="true">
    <path d="M51 28c-5-15 7-22 24-20-2 15-12 22-24 20Z" fill="#72946C"/>
    <path d="M50 28c0-8-4-11-7-14" stroke="#697F50" strokeWidth="4" strokeLinecap="round"/>
    <path d="M51 31C30 18 10 37 12 60c2 25 18 41 39 41s38-16 39-41C92 36 71 19 51 31Z" fill="#F18447"/>
    <path d="M29 44c-5 5-7 11-7 17" stroke="#FFC295" strokeWidth="5" strokeLinecap="round"/>
    <circle cx="57" cy="67" r="27" fill="#FFF4D8"/>
    <circle cx="57" cy="67" r="22" fill="#F5A05C"/>
    {[0, 60, 120, 180, 240, 300].map(angle => <path key={angle} d="M57 67v-23" stroke="#FFF4D8" strokeWidth="3" transform={`rotate(${angle} 57 67)`}/>)}
  </svg>;
}
