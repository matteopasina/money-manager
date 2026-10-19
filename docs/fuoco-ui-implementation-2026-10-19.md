# Fuoco — UI modulare e navigazione

Implementazione del piano del 19 ottobre 2026. Solo frontend e documentazione: nessuna modifica ai sorgenti backend, agli endpoint o allo schema del database durante questo intervento.

## Cosa cambia

- Sei destinazioni principali: Il tuo quadro, Movimenti, Patrimonio, Budget, Futuro, Assistente. Impostazioni in fondo alla sidebar.
- Patrimonio riunisce vista d’insieme, conti e saldi, investimenti Microsoft. Le valorizzazioni esistenti non vengono sommate una seconda volta.
- Movimenti include categorie e regole. Importazione contestuale per tipo e conto, con possibilità di cambiare tipo.
- Impostazioni riunisce connessioni, valute/cambi e preferenze. I vecchi percorsi mantengono query, hash e stato, inclusi i callback bancari.
- Home con patrimonio/andamento, mese attuale e previsione, flussi registrati, massimo tre priorità, ultimi movimenti e accesso contestuale all’assistente.
- Previsione soltanto sul mese corrente, senza nuovi algoritmi. I deficit consumano liquidità nel diagramma. La stima del saldo non viene spacciata per previsione delle singole categorie.
- Storico cash flow accessibile da Movimenti; storico dei conti e allocazione in Patrimonio.
- Palette avorio/verde/arancio, titoli Newsreader, controlli Hanken Grotesk, temi chiaro/scuro, moduli responsive. Tradotti i principali controlli e testi delle viste coinvolte; le guide tecniche dei provider e i contenuti generati dalle API conservano la loro lingua.
- I mesi di autonomia restano esclusi dalla prima versione: non esiste ancora una verifica affidabile della completezza dello storico necessaria al calcolo.

## Come aggiornare la UI

| Cosa modificare | Punto di ingresso |
|---|---|
| Destinazioni e loro ordine | `frontend/src/navigation/config.ts` |
| Sezioni locali e titoli | `components/workspace/SectionLayout.tsx` e configurazioni di routing in `App.tsx` |
| Blocchi in home, ordine e posizione mobile | `pages/home/layout.ts`; composizione in `pages/Dashboard.tsx` |
| Singolo blocco | `pages/home/PortfolioCard.tsx`, `MonthCard.tsx`, `FlowCard.tsx`, `AttentionCard.tsx`, `AskCard.tsx` |
| Palette e tipografia | `styles/tokens.css` e `utils/chartPalette.ts` |
| Geometria home | `styles/home.css` |
| Sidebar, sezioni e moduli | `styles/workspace.css` |
| Accesso ai dati | `api/client.ts`, hook `useHomeData`, `useHomeExtras`, `usePortfolioData` |
| Calcoli esistenti | `pages/dashboard/data.ts`, `utils/cashFlow.ts` |

Le card non effettuano richieste né mutazioni: ricevono valori e callback. Nessuna nuova dipendenza npm. Le API opzionali della home (budget e sincronizzazione) falliscono indipendentemente senza nascondere patrimonio e movimenti. La home non importa Plotly; i grafici interattivi restano negli approfondimenti.

Creare o disattivare un conto invalida la lettura dei saldi nella stessa pagina senza azzerare lo stato del modulo. I filtri dei movimenti e il mese della home sono rappresentati nella URL. Le domande passano all’assistente il periodo selezionato come contesto.

## Verifica

- Frontend: **64 test superati** in 14 file, inclusi routing/alias, filtri, forecast corrente, errori opzionali, importazione contestuale e aggiornamento conti senza perdita delle bozze.
- ESLint, TypeScript/build di produzione e `git diff --check`: superati.
- Browser: home a 390/768/1024/1440 px in entrambi i temi, senza overflow orizzontale. Verificate su mobile le pagine accorpate, Futuro, investimenti, connessioni, importazione e movimenti filtrati.
- Verificati Escape e ripristino del focus del menu mobile, confronto corrente/storico, contesto della domanda all’assistente e precompilazione del tipo/conto di importazione.
- Nessun errore console nella sessione browser finale.
- Rimane il warning Vite sul bundle Plotly (~1,09 MB minificato); il bundle non viene caricato dalla home.

Dettagli, log e screenshot: `docs/verification/fuoco-ui-2026-10-19/`. Le prove browser non includono un’autorizzazione bancaria reale, un upload bancario completo o una risposta LLM live: in preview il modello è lasciato vuoto per evitare chiamate esterne.

La verifica browser usa un database sintetico separato (`/tmp/fuoco-ui-modular-20261019.db`) con backend su 8014 e preview UI su 5174. Non sono stati usati conti bancari reali per le prove di interazione e non sono state eseguite sincronizzazioni esterne.

Sono preservate le modifiche preesistenti nel checkout. Build frontend e bundle statico FastAPI aggiornati; nessun commit o deploy remoto.

## Grafico dei flussi: revisione visiva

Il grafico usa ora un diagramma a tre livelli: entrate/liquidità → spese → categorie. I nodi sono sottili, i flussi curvi e traslucidi, gli importi e le percentuali sono integrati vicino ai rispettivi rami. Oltre quattro categorie, le minori vengono riunite in un residuo esplicito senza perdere importi. Il rapporto entrate/spese fornisce una lettura immediata del mese.

Le categorie aprono i movimenti con periodo e filtro appropriati; anche una categoria storica rimossa resta riconoscibile nel filtro. La variante compatta dipende dalla larghezza della card, con container query a 480 px. Diagramma, geometria e CSS sono separati (`FlowCard.tsx`, `moneyFlowLayout.ts`, `money-flow.css`), senza nuove dipendenze o cambiamenti al backend.

Verifica della revisione: 69 test frontend superati; lint e build superati. Nel browser verificati ingresso misto da entrate/liquidità, ramificazioni, clic su categoria, vista mobile senza overflow e tema scuro. Screenshot aggiornato: `verification/fuoco-ui-2026-10-19/money-flow-v2.jpg` (dati di prova).
