import { useState } from 'react'
import { ArrowUpRight, Sparkles } from 'lucide-react'

export default function AskCard({ onAsk, period }: { onAsk: (prompt: string) => void; period: string }) {
  const [question, setQuestion] = useState('')
  return <section className="home-panel ask-panel" aria-labelledby="ask-title">
    <Sparkles size={20} className="ask-spark" aria-hidden="true" /><h2 id="ask-title">Facciamo chiarezza.</h2><p>Una domanda concreta è un buon punto di partenza.</p>
    <button className="suggested-question" onClick={() => onAsk(`Quali spese sono aumentate nel mese ${period} rispetto al periodo confrontabile del mese precedente?`)}>Dove sto spendendo di più? <ArrowUpRight size={16} /></button>
    <form className="ask-input" onSubmit={e => { e.preventDefault(); if (question.trim()) onAsk(question.trim()) }}><label className="sr-only" htmlFor="home-question">Chiedi a Fuoco</label><input id="home-question" placeholder="Chiedi a Fuoco…" value={question} onChange={e => setQuestion(e.target.value)} /><button type="submit" aria-label="Invia domanda all’assistente" disabled={!question.trim()}><ArrowUpRight size={20} /></button></form>
  </section>
}
