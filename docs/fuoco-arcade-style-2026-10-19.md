# Fuoco Arcade — 19 ottobre 2026

Stile opzionale disponibile in **Impostazioni → Preferenze → Stile interfaccia → Arcade**. Editoriale resta il valore iniziale. Il tema chiaro/scuro è indipendente dallo stile.

## Confini

- `frontend/src/styles/arcade.css`: palette, tipografia, bordi e dettagli del tema, sotto `data-ui-style="arcade"`.
- `frontend/src/components/arcade/PixelArt.tsx`: illustrazioni SVG originali su griglia intera, decorative e nascoste alle tecnologie assistive.
- `ThemeContext.tsx` e `theme.ts`: preferenza locale `visual-style`, senza API o migrazioni. `?style=arcade` permette un’anteprima senza sovrascrivere la scelta salvata; la selezione nelle preferenze la salva.
- `MoneyChart.tsx`: font e colori dei grafici seguono lo stile; punti, importi, calcoli e continuità delle serie restano condivisi.

Nessuna modifica al backend per questo tema. Per cambiare la direzione visiva si possono sostituire token, CSS e componenti pixel separatamente.

## Verifica

Build, lint e suite frontend: 72 test passati. Test aggiunti per persistenza, anteprima URL, fallback e indipendenza dal tema chiaro/scuro.

Browser verificato su dati sintetici isolati: dashboard chiara e scura, preferenze con persistenza dopo reload, pagina movimenti con grafici. Home controllata a 390 e 768 px senza overflow orizzontale. La verifica non comprende ogni pagina e ogni combinazione di dati.

Screenshot in `docs/verification/fuoco-arcade-2026-10-19/`. Il servizio immagini ha fallito due tentativi per errore di rete: questa anteprima è implementata e catturata nell’app, non generata dal servizio immagini.
