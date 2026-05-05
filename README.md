# Imposter / Undercover Word Game (Lokal)

## Setup

```bash
npm install
npm start
```

Dann im Browser öffnen:

- http://localhost:3000

## Hinweise

- Host erstellt eine Lobby und teilt den Code.
- Für mehrere Geräte im selben Netzwerk statt `localhost` die lokale IP des Host-PCs nutzen.
- Mindestspielerzahl: 3.
- Bei 3-4 Spielern gibt es 1 Imposter, bei 5+ Spielern 2 Imposter.
- Der Host kann vor jeder Runde eine Wortliste wählen: Fußballer (146), Filme/Serien (322), Allgemeine Wörter (1000), Anime (100) oder alle Kategorien.
- Bei der Abstimmung ist Enthalten erlaubt. Raus fliegt nur, für wen mehr als die Hälfte der aktiven Spieler stimmt.
- Wird kein Imposter rausgewählt, spielt der falsch gewählte Crew Mate nicht weiter. Imposter gewinnen, sobald gleich viele Imposter wie Crew Mates aktiv sind.
