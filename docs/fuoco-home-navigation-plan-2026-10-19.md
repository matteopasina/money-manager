# Fuoco: home e navigazione più semplici

Data: 19 ottobre 2026. Stato: prima versione implementata. Risultato, architettura e verifiche in [fuoco-ui-implementation-2026-10-19.md](fuoco-ui-implementation-2026-10-19.md). Il calcolo di autonomia resta escluso, come previsto dal piano.

## Obiettivo e perimetro

Rendere la home un quadro immediato di patrimonio, mese corrente e cose da controllare. Ridurre la sidebar da 11 voci a 6 destinazioni principali più Impostazioni. Mantenere disponibili tutte le funzioni esistenti, assegnando a ciascuna un posto riconoscibile.

Direzione visiva: il concept generato in questa conversazione, con avorio, verde profondo e accento arancio. Il cambiamento principale è la gerarchia delle informazioni; evitare una semplice ricolorazione della pagina attuale.

## Evidenze della review

Review del codice corrente, dei documenti di design e della schermata `docs/audits/net-worth-comparisons-2026-10-19.jpg`. Nessuna verifica browser live in questa fase: i servizi locali sulle porte 5173 e 8000 non erano attivi.

- `frontend/src/App.tsx`: 11 destinazioni distribuite tra Overview, Activity, Plan e Setup. Quattro voci di configurazione occupano stabilmente la navigazione.
- `Dashboard.tsx`: hero patrimonio, quattro metriche mensili, grafico cash flow, categorie di spesa, budget, grafico patrimonio, allocazione, storico conti, movimenti recenti e insights. La sequenza è lunga e ripete gli stessi domini; gli insights arrivano dopo i dettagli.
- `Accounts.tsx`: le azioni Microsoft sono mostrate prima della gestione conti e cambi. Il titolo Accounts & FX non descrive tutto ciò che contiene.
- `Balances.tsx`: gestione snapshot separata dai conti cui appartengono.
- `Import.tsx`: importa sia movimenti sia saldi; non va riprogettata come funzione esclusiva dei movimenti.
- `Projections.tsx`: Forecast e Goal Planner sono già riuniti. Questo accorpamento va mantenuto.
- `FinancialHelper.tsx`: Review, Cleanup e Chat sono già tre modalità dello stesso assistente. Preservare le capacità di cleanup e le conferme delle azioni.
- Il design system offre già token, temi e gestione mobile/accessibilità. Evolverlo senza introdurre un secondo sistema parallelo.

## Mappa proposta

| Sidebar | Contenuto e accessi secondari |
|---|---|
| Il tuo quadro | Home sintetica, mese corrente, priorità e accessi ai dettagli |
| Movimenti | Elenco e filtri; sezione locale Categorie e regole; pulsante Importa movimenti |
| Patrimonio | Vista d'insieme e andamento; sezioni locali Conti e saldi, Investimenti; gestione conto, cambio e importazione saldi contestuali |
| Budget | Limiti, residui, storico e rollover; autonomia rispetto ai movimenti |
| Futuro | Previsioni e Obiettivi, mantenendo gli strumenti esistenti |
| Assistente | Chat, Riepilogo e Riordina movimenti; accesso contestuale anche dalla home |
| Impostazioni, in fondo | Connessioni e sincronizzazione, Valute e cambi, Preferenze e modello AI |

Regole:

- Eliminare dalla sidebar Balances, Import, Accounts & FX, Categories & Rules, Connections e Preferences come destinazioni autonome; Patrimonio è la nuova destinazione principale che riunisce conti e saldi.
- Non sostituire la sidebar affollata con una riga di dieci tab: massimo 2–3 sezioni locali per pagina, azioni di modifica nei contesti pertinenti.
- La gestione conti ha una sede canonica in Patrimonio; le connessioni permettono di collegare un conto senza duplicarne l'editor.
- Categorie e regole hanno una sede canonica in Movimenti, raggiungibile anche da Budget e cleanup.
- Importazione: riusare lo stesso flusso, precompilando conto e tipo quando si arriva da Movimenti o Patrimonio. Consentire sempre di cambiare tipo.
- Impostazioni conserva 3 sezioni: Connessioni, Valute e cambi, Preferenze. Stato sincronizzazione sintetico vicino ai conti; errori con link alla connessione interessata.
- Ogni sezione locale ha URL ripristinabile (path o query), supporta back/forward e link diretti. Le vecchie URL, compresi gli alias già presenti, indirizzano alla nuova sede conservando filtri e intenti pertinenti. Nessuna rotta viene semplicemente rimossa.

## Home proposta

1. **Intestazione compatta:** titolo, periodo e aggiornamento dati. Nome solo se disponibile realmente; nessun nome hardcoded. Importazione e inserimento saldo diventano azioni contestuali, non i due pulsanti dominanti di ogni visita.
2. **Patrimonio e mese affiancati:** totale con un unico andamento leggibile, confronto mensile e accesso al dettaglio; a fianco entrate, spese e saldo del mese con situazione registrata e stima di fine mese esplicite. Il confronto giornaliero rimane nel dettaglio.
3. **Dove scorre il denaro + Da tenere a fuoco:** flussi del mese e massimo tre priorità ordinate per rilevanza: connessioni da ripristinare, budget superati, movimenti da classificare. Ogni priorità apre il filtro o la sezione utile. Messaggio tranquillo se non serve agire.
4. **Dettagli secondari:** pochi movimenti recenti e rimandi a Patrimonio/Budget. Storico cash flow, allocazione estesa e serie dei singoli conti nelle rispettive destinazioni. Evitare grafici duplicati della stessa misura in home.
5. **Assistente:** invito compatto con domanda contestuale, senza una seconda grande dashboard di suggerimenti in fondo.

Schema desktop:

```text
sidebar       titolo compatto                         stato dati
              patrimonio + andamento       il tuo mese
              dove scorre il denaro         da tenere a fuoco
              ultimi movimenti             chiedi a Fuoco
```

Su mobile: mese, patrimonio, priorità, flussi e ultimi movimenti in sequenza. Sostituire il diagramma di flusso con un riepilogo a barre quando lo spazio lo rende meno leggibile. Nessun obbligo di comprimere tutta la home in un singolo schermo.

## Correzioni al concept prima di implementarlo

- **Autonomia:** proporre “Autonomia della liquidità”, calcolata come liquidità disponibile / spesa media mensile osservata nei mesi conclusi. Non usare tutto il patrimonio come denaro spendibile e non chiamarla indipendenza finanziaria. Nuova misura da implementare, non un dato già disponibile. Usare una finestra dichiarata fino a 6 mesi, almeno 3 mesi osservati, indicare copertura e limiti dell'importazione; nascondere il risultato se la base non è significativa. Le sole date dei movimenti non provano completezza dei mesi. Nella prima consegna può essere omessa finché la metodologia non è verificata.
- Un anello di completamento richiede un obiettivo esplicito. Senza obiettivo, rappresentare l'autonomia con un valore e una piccola scala, evitando percentuali arbitrarie.
- **Flussi:** nella prima versione mostrare valori registrati, senza inventare una previsione per categoria. La stima esistente prevede il saldo complessivo, non tutte le categorie. Gestire deficit come consumo di liquidità, rimborsi e assenza di entrate: nessun “risparmio” positivo fittizio e nessun nastro con importo negativo.
- **Previsione:** riusare `expectedMonthCashFlow` e le esclusioni esistenti; solo mese corrente, metodologia accessibile e assenza esplicita quando manca lo storico. I mesi passati restano consuntivi. Non presentare una data di stipendio certa se non verificata.
- **Budget:** distinguere residuo nel budget da saldo mensile e denaro libero da spendere. La somma di budget di categoria non è automaticamente un tetto globale; non contare due volte il budget totale.
- **Freschezza:** “Conti aggiornati” soltanto se supportato dagli stati effettivi. Date dei saldi e ultimo movimento restano consultabili; ultimo sync riuscito non prova che tutti i conti abbiano saldi odierni.
- **Investimenti:** riusare il componente MSFT esistente dentro Patrimonio senza far credere che rappresenti un portafoglio titoli generale. La valorizzazione non deve sommarsi nuovamente al saldo già aggiornato dal componente.
- Conservare valuta base, importi nativi nei dettagli, trattamento saldi negativi, confronti a parità di conti, esclusione trasferimenti/trade e campionamento sulle date registrate. Variazione patrimonio non equivale a rendimento.

## Direzione visiva e linguaggio

- Evolvere `tokens.css`, `globals.css`, `chartPalette.ts` e `/design-system` insieme. Palette proposta: avorio `#F4F1E8`, superficie `#FBF8F1`, inchiostro `#172C26`, verde `#183F36`, salvia `#A6C59A`, arancio `#E76A32`. Verificare contrasto dei colori effettivamente usati per testo e controlli.
- Conservare il logo Fuoco. Hanken Grotesk per controlli e dati; valutare un serif nei soli titoli per avvicinarsi al concept, dopo confronto renderizzato. Numeri tabulari e segni chiari.
- Arancio come accento di marca e azione, colori semantici distinti per perdite e guadagni. Il significato non dipende solo dal colore.
- Ridurre pannelli annidati, etichette tecniche e descrizioni ripetute; aumentare spazio tra gruppi, mantenendo compatto ciò che si legge insieme.
- Proposta di interfaccia in italiano: navigazione, home e pagine accorpate con la stessa terminologia. Evitare una nuova shell italiana sopra moduli interamente inglesi; completare i testi delle pagine migrate nella stessa fase. Una traduzione bilingue con selettore lingua è un lavoro separato.

## Consegne e ordine di implementazione

1. **Navigazione:** shell con sei voci, Impostazioni in fondo, pagine contenitore Patrimonio/Impostazioni, sezioni locali e migrazione URL. Riutilizzare i moduli e lasciare un unico titolo e una sola toolbar per ogni pagina contenitore. Estrarre i contenuti dalle pagine attuali dove serve.
2. **Home:** nuova composizione, dati esistenti, nessuna duplicazione dei grafici. Collegamenti alle nuove destinazioni; grafico flussi con alternative leggibili e corretta gestione del deficit.
3. **Coerenza delle pagine:** conti/saldi/MSFT, categorie/regole, importazione contestuale; uniformare titoli, azioni e lingua; mantenere Previsioni/Obiettivi e funzionalità dell'assistente.
4. **Rifinitura visiva:** token e tipografia, responsività, temi, grafici, microcopy e stati vuoti. Autonomia soltanto dopo verifica separata del calcolo.
5. **Verifica e confronto:** screenshot reali desktop/mobile e confronto con il concept. Rivedere la densità delle pagine prima di considerare conclusa la modifica.

Ogni consegna deve essere funzionante e revisionabile. Il checkout contiene molte modifiche preesistenti: preservarle, verificare il diff iniziale e limitare gli interventi al perimetro UI necessario. Nessuna migrazione DB prevista; introdurre modifiche backend solo se emerge una mancanza concreta di dati.

## Criteri di accettazione

- Sei destinazioni principali e un accesso Impostazioni, senza gruppi di navigazione vuoti o menu secondari affollati.
- Tutte le funzioni attuali raggiungibili; vecchie URL, query di cleanup, browser back/forward e link contestuali funzionanti.
- Home con patrimonio, situazione mensile e priorità riconoscibili senza scorrere più schermate su desktop; nessuna perdita delle note indispensabili all'interpretazione.
- Nessun cambiamento involontario nei calcoli; casi di storico insufficiente, mese in deficit, budget assente, saldi negativi, dati vecchi e API parzialmente fallite gestiti.
- Navigazione mobile e da tastiera, focus/Escape, nessun overflow a 390/768/1024/1440 px; controllo dei due temi e reduced motion.
- Test mirati su routing/redirect, filtri, importazioni contestuali e calcoli nuovi. Eseguire suite frontend, lint e build; suite backend se si toccano endpoint/calcoli server.
- Verifica browser dei percorsi home → movimento da classificare, patrimonio → saldo/import, impostazioni → connessione e ritorno, futuro → obiettivo, domanda → assistente. Conservare screenshot e limiti della verifica.

## Fuori da questa consegna

Nuove integrazioni, nuovi algoritmi previsionali, nuove operazioni finanziarie, riscrittura del backend e cancellazione di dati o capacità esistenti. La pagina `/design-system` resta accessibile direttamente agli sviluppatori senza entrare nella sidebar quotidiana.
